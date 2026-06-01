// FlowAI CRM — Evolution API Webhook
//
// Architecture: intentionally THIN.
// This route validates, logs, and enqueues. All DB writes and automations
// run in background workers so the HTTP response stays under 50 ms.
// Evolution retries any non-2xx response — returning 200 always prevents
// duplicate job creation.

import { NextRequest, NextResponse } from "next/server";
import {
  enqueueMessage,
  enqueueStatus,
  enqueueConnection,
} from "@/lib/queue/producers";
import type {
  EvolutionWebhookPayload,
  EvolutionMessageData,
  EvolutionStatusUpdate,
  EvolutionConnectionUpdate,
} from "@/types/evolution";

// Required for node:crypto (timingSafeEqual) and queue libraries that use
// Node.js built-ins. Not compatible with the Vercel Edge Runtime.
export const runtime = "nodejs";

// ─── Types ────────────────────────────────────────────────────────────────────

// Mirrors the shape Evolution API sends for a send.message event
interface EvolutionSendMessageData {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
    participant?: string;
  };
  message?: Record<string, unknown>;
  messageType?: string;
  messageTimestamp?: number;
  instanceId?: string;
  source?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET       = process.env.EVOLUTION_WEBHOOK_SECRET ?? "";
// Canonical instance name — rejects any webhook from a different instance.
// Set to "" to disable the check (multi-tenant mode).
const CANONICAL_INSTANCE   = process.env.EVOLUTION_INSTANCE_NAME ?? "";

// ─── GET — health / verification ─────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Hub-style challenge used by some webhook verification flows
  const challenge   = request.nextUrl.searchParams.get("hub.challenge");
  const verifyToken = request.nextUrl.searchParams.get("hub.verify_token");

  if (challenge && verifyToken === WEBHOOK_SECRET) {
    console.log("[webhook/whatsapp] GET — challenge accepted");
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({
    success: true,
    service: "FlowAI CRM — WhatsApp Webhook",
    timestamp: new Date().toISOString(),
  });
}

// ─── POST — event receiver ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const receivedAt = new Date().toISOString();
  const traceId    = `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  // ── 1. Parse JSON ────────────────────────────────────────────────────────
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    console.warn("[webhook/whatsapp] Invalid JSON body");
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const payload    = body as unknown as EvolutionWebhookPayload;
  const rawEvent   = (payload.event ?? "") as string;
  const event      = normalizeEventName(rawEvent);
  const instance   = (payload.instance ?? "unknown") as string;

  // ── 2. Verify secret ──────────────────────────────────────────────────────
  if (!verifySecret(request, payload.apikey)) {
    console.warn("[webhook/whatsapp] Rejected — invalid secret", { instance, event });
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // ── 3. Instance guard ─────────────────────────────────────────────────────
  if (CANONICAL_INSTANCE && instance !== CANONICAL_INSTANCE) {
    console.warn("[INSTANCE_CHECK] mismatch — rejecting", {
      expected: CANONICAL_INSTANCE,
      received: instance,
      event,
    });
    return NextResponse.json({ success: false, error: "Unknown instance" }, { status: 400 });
  }
  console.log("[INSTANCE_CHECK] ok", { expected: CANONICAL_INSTANCE || "(any)", received: instance });

  // ── 4. Log every incoming event ───────────────────────────────────────────
  console.log("[TRACE_A] webhook received", {
    traceId,
    event,
    rawEvent,
    instance,
    receivedAt,
    destination: payload.destination ?? null,
    sender:      payload.sender ?? null,
  });

  // ── 4. Dispatch by event type ─────────────────────────────────────────────
  // Always return 200 — wrap dispatch in try/catch so queue errors never
  // cause Evolution to retry (which would create duplicate messages).
  try {
    switch (event) {

      // ── Inbound message received ──────────────────────────────────────────
      case "messages.upsert": {
        const items = resolveMessageArray(payload.data);

        console.log("[webhook/whatsapp] MESSAGES_UPSERT", {
          instance,
          count:     items.length,
          messageIds: items.map((m) => m.key?.id).filter(Boolean),
          fromMe:    items.map((m) => m.key?.fromMe),
          types:     items.map((m) => m.messageType),
        });

        await Promise.all(
          items.map((data) =>
            enqueueMessage({ instanceName: instance, data, receivedAt, traceId })
          )
        );
        break;
      }

      // ── Message status update (sent / delivered / read) ───────────────────
      case "messages.update": {
        const updates = Array.isArray(payload.data)
          ? (payload.data as EvolutionStatusUpdate[])
          : [payload.data as unknown as EvolutionStatusUpdate];

        console.log("[webhook/whatsapp] MESSAGES_UPDATE", {
          instance,
          count:      updates.length,
          messageIds: updates.map((u) => u.key?.id).filter(Boolean),
          statuses:   updates.map((u) => u.update?.status),
        });

        await enqueueStatus({ instanceName: instance, updates });
        break;
      }

      // ── WhatsApp session state change ─────────────────────────────────────
      case "connection.update": {
        const connData = payload.data as EvolutionConnectionUpdate;
        const newState = connData?.state ?? "unknown";

        console.log("[webhook/whatsapp] CONNECTION_UPDATE", {
          instance,
          state:        newState,
          statusReason: connData?.statusReason ?? null,
        });

        // Deduplicate: only enqueue state transitions that are meaningful.
        // Ignoring "connecting" prevents Redis spam from Baileys reconnect loops
        // (each reconnect cycle fires: connecting → open → close → connecting → …)
        const MEANINGFUL_STATES = new Set(["open", "close"]);
        if (connData?.state && MEANINGFUL_STATES.has(connData.state)) {
          await enqueueConnection({
            instanceName: instance,
            state:        connData.state,
          });
        }
        break;
      }

      // ── Message sent BY the connected number ──────────────────────────────
      case "send.message": {
        const sendData = payload.data as EvolutionSendMessageData;

        console.log("[webhook/whatsapp] SEND_MESSAGE", {
          instance,
          messageId:  sendData?.key?.id ?? null,
          remoteJid:  sendData?.key?.remoteJid ?? null,
          fromMe:     sendData?.key?.fromMe ?? null,
          type:       sendData?.messageType ?? null,
          timestamp:  sendData?.messageTimestamp ?? null,
        });

        // SEND_MESSAGE fires when the Evolution-connected number sends a
        // message from another device (phone, web, etc.). Enqueue as a
        // standard upsert so the conversation is updated consistently.
        await enqueueMessage({
          instanceName: instance,
          data:         sendData as unknown as EvolutionMessageData,
          receivedAt,
          traceId,
        });
        break;
      }

      // ── QR code refreshed (informational — no action needed) ─────────────
      case "qrcode.updated": {
        console.log("[webhook/whatsapp] QRCODE_UPDATED", { instance });
        break;
      }

      // ── All other events — acknowledge without processing ─────────────────
      default: {
        console.log("[webhook/whatsapp] Unhandled event (acknowledged)", { event, instance });
        break;
      }
    }
  } catch (err) {
    // Log but still return 200 — prevents Evolution from retrying
    console.error("[webhook/whatsapp] Queue error", {
      event,
      instance,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ success: true });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalizes Evolution API event names to lowercase dot-notation.
 * v1 sends "messages.upsert"; v2 sends "MESSAGES_UPSERT".
 * Both become "messages.upsert" after this function.
 */
function normalizeEventName(event: string): string {
  return event.toLowerCase().replace(/_/g, ".");
}

/**
 * Verifies the request comes from our configured Evolution API instance.
 * Accepts the secret in three locations Evolution v2 may use:
 *   1. apikey header
 *   2. x-webhook-secret header
 *   3. Authorization: Bearer <secret> header
 *   4. apikey field inside the JSON payload body
 *
 * If EVOLUTION_WEBHOOK_SECRET is not set, all requests are accepted
 * (with a warning in production so it's visible in logs).
 */
function verifySecret(request: NextRequest, payloadApiKey?: string): boolean {
  if (!WEBHOOK_SECRET) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[webhook/whatsapp] EVOLUTION_WEBHOOK_SECRET is not set — endpoint is unprotected"
      );
    }
    return true;
  }

  const headerKey =
    request.headers.get("apikey") ??
    request.headers.get("x-webhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  return headerKey === WEBHOOK_SECRET || payloadApiKey === WEBHOOK_SECRET;
}

/**
 * Evolution API delivers messages.upsert data in multiple shapes across
 * versions. This function normalises all of them to EvolutionMessageData[].
 *
 *   v1 shape:  payload.data = [ messageObject, ... ]
 *   v2 shape:  payload.data = { messages: [ messageObject, ... ] }
 *   v2 single: payload.data = messageObject  (has "key" field)
 */
function resolveMessageArray(rawData: unknown): EvolutionMessageData[] {
  if (!rawData) return [];

  // Array of messages (most common — v1 and v2)
  if (Array.isArray(rawData)) {
    return rawData as EvolutionMessageData[];
  }

  if (typeof rawData === "object") {
    const obj = rawData as Record<string, unknown>;

    // v2 wrapped shape: { messages: [...] }
    if (Array.isArray(obj.messages)) {
      return obj.messages as EvolutionMessageData[];
    }

    // Single message object: has a "key" field
    if ("key" in obj) {
      return [rawData as EvolutionMessageData];
    }
  }

  return [];
}
