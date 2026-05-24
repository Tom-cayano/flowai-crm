// FlowAI CRM — WhatsApp Webhook (Evolution API)
//
// This route is intentionally THIN. It validates, parses, and enqueues.
// All processing (DB writes, automations, media) happens in the worker.
//
// Response time target: <50ms
// This ensures Evolution API does not retry due to timeouts.

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

// ─── Constants ────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = process.env.EVOLUTION_WEBHOOK_SECRET ?? "";

// ─── Health check ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const token     = request.nextUrl.searchParams.get("hub.verify_token");

  if (challenge && token === WEBHOOK_SECRET) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ status: "ok", service: "FlowAI CRM — WhatsApp Webhook" });
}

// ─── Event receiver ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = body as unknown as EvolutionWebhookPayload;

  // ── Verify secret ─────────────────────────────────────────────────────────
  if (!verifySecret(request, payload.apikey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const event      = normalizeEventName((payload.event ?? "") as string);
  const instance   = (payload.instance ?? "") as string;
  const receivedAt = new Date().toISOString();

  // Always return 200 — Evolution retries on any non-2xx which creates duplicates
  try {
    switch (event) {
      case "messages.upsert": {
        const items = resolveMessageArray(payload.data);
        await Promise.all(
          items.map((data) => enqueueMessage({ instanceName: instance, data, receivedAt }))
        );
        break;
      }

      case "messages.update": {
        const updates = Array.isArray(payload.data)
          ? (payload.data as EvolutionStatusUpdate[])
          : [payload.data as unknown as EvolutionStatusUpdate];
        await enqueueStatus({ instanceName: instance, updates });
        break;
      }

      case "connection.update": {
        const connData = payload.data as EvolutionConnectionUpdate;
        if (connData?.state) {
          await enqueueConnection({
            instanceName: instance,
            state:        connData.state,
          });
        }
        break;
      }

      // Acknowledged but not queued — avoids Evolution retrying unknown events
      default:
        break;
    }
  } catch (err) {
    // Log but always return 200
    console.error(`[webhook] Queue error for event "${event}":`, err);
  }

  return NextResponse.json({ received: true });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeEventName(event: string): string {
  return event.toLowerCase().replace(/_/g, ".");
}

function verifySecret(request: NextRequest, payloadApiKey?: string): boolean {
  if (!WEBHOOK_SECRET) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[webhook] EVOLUTION_WEBHOOK_SECRET not set — endpoint unprotected");
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
 * Evolution API sends messages.upsert in multiple shapes across versions.
 * Normalise all of them to EvolutionMessageData[].
 */
function resolveMessageArray(rawData: unknown): EvolutionMessageData[] {
  if (Array.isArray(rawData)) {
    return rawData as EvolutionMessageData[];
  }

  if (rawData && typeof rawData === "object") {
    const obj = rawData as Record<string, unknown>;

    if (Array.isArray(obj.messages)) {
      return obj.messages as EvolutionMessageData[];
    }

    if ("key" in obj) {
      return [rawData as EvolutionMessageData];
    }
  }

  return rawData ? [rawData as EvolutionMessageData] : [];
}
