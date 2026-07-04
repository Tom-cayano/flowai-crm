// FlowAI CRM — Universal lead webhook
//
// Any external application (Transforma Fit Coach, landing pages, stores,
// mobile apps, third-party APIs...) connects by POSTing events here with the
// Bearer token generated in the Integraciones panel.
//
// Pipeline:
//   validate security → persist event → upsert contact → run automations
//
// Reliability: the event row is written BEFORE processing; if processing
// fails a retry job with exponential backoff is enqueued. A lead is never
// silently dropped — worst case it sits as failed/dead in the panel.
//
// Contract (flexible — unknown fields are preserved in custom_fields):
//   POST /api/webhooks/leads
//   Authorization: Bearer fw_...
//   x-flowai-signature: sha256=<hmac hex>        (only if HMAC is configured)
//   x-idempotency-key: <any unique id>           (optional dedup)
//   {
//     "source": "Transforma Fit Coach",
//     "event":  "lead_created",
//     "contact": { "name": "...", "email": "...", "phone": "...", "goal": "...", "tags": [] },
//     "custom_data": { ... }
//   }

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { looksLikeIntegrationToken } from "@/lib/integrations/token";
import {
  isIpRateLimited,
  isIntegrationRateLimited,
  isAuthBlocked,
  registerAuthFailure,
  recordSecurityEvent,
  verifyHmacSignature,
} from "@/lib/integrations/security";
import { processLeadEvent } from "@/lib/integrations/lead-processor";
import { enqueueLeadWebhookRetry } from "@/lib/queue/producers";
import type { LeadWebhookPayload } from "@/lib/integrations/types";
import type { Json } from "@/types/supabase";

// node:crypto (HMAC) + ioredis/bullmq require the Node.js runtime
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

// ─── GET — health / discovery ─────────────────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    success:   true,
    service:   "FlowAI CRM — Universal Lead Webhook",
    method:    "POST",
    auth:      "Authorization: Bearer <token>  (+ x-flowai-signature when HMAC is enabled)",
    docs:      "Panel → Integraciones",
    timestamp: new Date().toISOString(),
  });
}

// ─── POST — universal event receiver ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const ip = clientIp(request);

  // ── 1. Rate limit por IP + bloqueo por fuerza bruta ───────────────────────
  if (await isIpRateLimited(ip)) {
    await recordSecurityEvent({ reason: "rate_limited", ip, detail: "IP rate limit exceeded" });
    return NextResponse.json({ success: false, error: "Rate limit exceeded" }, { status: 429 });
  }
  if (await isAuthBlocked(ip)) {
    return NextResponse.json({ success: false, error: "Too many failed attempts" }, { status: 429 });
  }

  // ── 2. Extract Bearer token ────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token || !looksLikeIntegrationToken(token)) {
    await registerAuthFailure(ip);
    await recordSecurityEvent({ reason: "invalid_token", ip, detail: "Missing or malformed Bearer token" });
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // ── 3. Resolve integration ────────────────────────────────────────────────
  const db = createAdminClient();
  const { data: integration } = await db
    .from("webhook_integrations")
    .select("id, user_id, name, source_key, enabled, hmac_secret, default_tags")
    .eq("token", token)
    .maybeSingle();

  if (!integration) {
    await registerAuthFailure(ip);
    await recordSecurityEvent({ reason: "invalid_token", ip, detail: "Token does not match any integration" });
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!integration.enabled) {
    await recordSecurityEvent({
      reason: "disabled", ip,
      integrationId: integration.id, userId: integration.user_id,
      detail: `Integration "${integration.name}" is disabled`,
    });
    return NextResponse.json({ success: false, error: "Integration disabled" }, { status: 403 });
  }

  // ── 4. Rate limit por integración ─────────────────────────────────────────
  if (await isIntegrationRateLimited(integration.id)) {
    await recordSecurityEvent({
      reason: "rate_limited", ip,
      integrationId: integration.id, userId: integration.user_id,
      detail: "Integration rate limit exceeded",
    });
    return NextResponse.json({ success: false, error: "Rate limit exceeded" }, { status: 429 });
  }

  // ── 5. Read raw body (needed for HMAC) + verify signature ─────────────────
  const rawBody = await request.text();

  if (integration.hmac_secret) {
    const signature = request.headers.get("x-flowai-signature");
    if (!verifyHmacSignature(rawBody, signature, integration.hmac_secret)) {
      await registerAuthFailure(ip);
      await recordSecurityEvent({
        reason: "invalid_signature", ip,
        integrationId: integration.id, userId: integration.user_id,
        detail: signature ? "Signature mismatch" : "Missing x-flowai-signature header",
      });
      return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 401 });
    }
  }

  // ── 6. Parse + validate payload ───────────────────────────────────────────
  let payload: LeadWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as LeadWebhookPayload;
  } catch {
    await recordSecurityEvent({
      reason: "invalid_payload", ip,
      integrationId: integration.id, userId: integration.user_id,
      detail: "Body is not valid JSON",
    });
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return NextResponse.json({ success: false, error: "Body must be a JSON object" }, { status: 400 });
  }

  const source = typeof payload.source === "string" && payload.source.trim()
    ? payload.source.trim()
    : integration.source_key;
  const event = typeof payload.event === "string" && payload.event.trim()
    ? payload.event.trim()
    : "lead_created";

  const contact = payload.contact;
  const hasContactData =
    contact && typeof contact === "object" &&
    Boolean(contact.name || contact.email || contact.phone || contact.whatsapp);

  if (!hasContactData) {
    await recordSecurityEvent({
      reason: "invalid_payload", ip,
      integrationId: integration.id, userId: integration.user_id,
      detail: "contact requires at least one of: name, email, phone, whatsapp",
    });
    return NextResponse.json(
      { success: false, error: "contact requires at least one of: name, email, phone, whatsapp" },
      { status: 422 }
    );
  }

  // ── 7. Persist the event BEFORE processing (never lose a lead) ────────────
  const idempotencyKey = request.headers.get("x-idempotency-key")?.trim() || null;

  const { data: eventRow, error: insertError } = await db
    .from("integration_events")
    .insert({
      integration_id:  integration.id,
      user_id:         integration.user_id,
      source,
      event,
      payload:         payload as unknown as Json,
      idempotency_key: idempotencyKey,
    })
    .select("id")
    .single();

  if (insertError || !eventRow) {
    // Unique violation → duplicate idempotency key → already accepted before
    if (insertError?.code === "23505" && idempotencyKey) {
      const { data: existing } = await db
        .from("integration_events")
        .select("id, status, contact_id")
        .eq("integration_id", integration.id)
        .eq("idempotency_key", idempotencyKey)
        .single();
      return NextResponse.json({
        success:    true,
        duplicate:  true,
        event_id:   existing?.id ?? null,
        status:     existing?.status ?? "received",
        contact_id: existing?.contact_id ?? null,
      });
    }
    console.error("[webhooks/leads] Failed to persist event:", insertError?.message);
    // 500 → the sender should retry
    return NextResponse.json({ success: false, error: "Failed to persist event" }, { status: 500 });
  }

  // ── 8. Process inline; on failure enqueue retry with backoff ──────────────
  try {
    const result = await processLeadEvent(eventRow.id);

    console.info("[webhooks/leads] processed", {
      integration: integration.name,
      source,
      event,
      eventId:     eventRow.id,
      contactId:   result.contactId,
      created:     result.contactCreated,
      automations: result.automationsTriggered.length,
      elapsedMs:   Date.now() - startedAt,
    });

    return NextResponse.json({
      success:         true,
      event_id:        eventRow.id,
      contact_id:      result.contactId,
      contact_created: result.contactCreated,
      automations_triggered: result.automationsTriggered,
      processing_ms:   Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[webhooks/leads] Inline processing failed — scheduling retry", {
      eventId: eventRow.id,
      error:   message,
    });

    try {
      await enqueueLeadWebhookRetry({ eventId: eventRow.id, userId: integration.user_id });
      // 202: accepted, will be retried in background
      return NextResponse.json(
        { success: true, event_id: eventRow.id, status: "queued_for_retry" },
        { status: 202 }
      );
    } catch (queueErr) {
      console.error("[webhooks/leads] Retry enqueue also failed:", queueErr);
      // Both inline and queue failed — tell the sender to retry
      return NextResponse.json(
        { success: false, event_id: eventRow.id, error: "Processing failed — please retry" },
        { status: 500 }
      );
    }
  }
}
