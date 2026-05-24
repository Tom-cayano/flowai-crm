// Facebook Messenger Webhook — intentionally THIN.
// Validates HMAC signature, deduplicates by MID, and enqueues in <50ms.
// Meta retries any non-2xx response, which would create duplicate jobs.
// All DB writes happen in workers/processors/messenger-message.processor.ts.
//
// Events handled:
//   messaging.messages          — incoming text / attachments
//   messaging.messaging_reads   — read receipts (ack'd, not queued)
//   messaging.messaging_postbacks — button / quick-reply clicks (logged only)
//   messaging.message_deliveries — delivery confirmations (ack'd, not queued)
//
// Security:
//   GET  — hub.verify_token handshake (FACEBOOK_VERIFY_TOKEN)
//   POST — X-Hub-Signature-256 HMAC-SHA256 (META_APP_SECRET via lib/messenger/client.ts)
//
// Already public: middleware PUBLIC_API_PREFIXES covers /api/webhook/

import { NextRequest, NextResponse } from "next/server";
import { verifyMessengerSignature } from "@/lib/messenger/client";
import { enqueueFBMessage } from "@/lib/queue/producers";
import type { FBMessageJob } from "@/lib/queue/types";

// ─── GET — webhook verification handshake ─────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.FACEBOOK_VERIFY_TOKEN ?? "";

  if (!verifyToken) {
    console.error("[fb-webhook] FACEBOOK_VERIFY_TOKEN is not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (mode === "subscribe" && token === verifyToken && challenge) {
    console.log("[fb-webhook] Webhook verified by Meta");
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn("[fb-webhook] Verification failed — mode=%s token_match=%s", mode, token === verifyToken);
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ─── POST — event ingestion ───────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Buffer raw body — HMAC is computed over raw bytes
  const rawBody    = await req.arrayBuffer();
  const bodyBuffer = Buffer.from(rawBody);

  // ── HMAC-SHA256 signature verification ───────────────────────────────────
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  if (!verifyMessengerSignature(bodyBuffer, signature)) {
    console.warn("[fb-webhook] Signature mismatch — dropping event");
    // Return 200 to prevent Meta from retrying with a bad secret
    return NextResponse.json({ received: false }, { status: 200 });
  }

  // ── Parse payload ─────────────────────────────────────────────────────────
  let payload: MessengerWebhookPayload;
  try {
    payload = JSON.parse(bodyBuffer.toString("utf8")) as MessengerWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only handle page object type — Messenger sends object: "page"
  if (payload.object !== "page") {
    return NextResponse.json({ received: true });
  }

  const receivedAt = new Date().toISOString();

  try {
    for (const entry of payload.entry ?? []) {
      const pageId = entry.id;

      for (const event of entry.messaging ?? []) {
        const senderId    = event.sender.id;
        const recipientId = event.recipient.id;

        // ── Incoming message ────────────────────────────────────────────────
        if (event.message) {
          const mid = event.message.mid;
          if (!mid) continue;

          const job: FBMessageJob = {
            pageId,
            senderId,
            recipientId,
            mid,
            text:        event.message.text ?? null,
            attachments: event.message.attachments ?? null,
            timestamp:   event.timestamp,
            isEcho:      event.message.is_echo === true,
            receivedAt,
          };

          await enqueueFBMessage(job);
          continue;
        }

        // ── Postback (button / quick-reply click) ───────────────────────────
        // Ack'd only — full postback handling is Phase 5b
        if (event.postback) {
          console.log("[fb-webhook] postback | page=%s sender=%s payload=%s",
            pageId, senderId, event.postback.payload);
        }

        // ── Read receipt + delivery — ack'd, not queued ─────────────────────
        if (event.read || event.delivery) {
          // Intentionally ignored at this tier; status sync is Phase 5b
        }
      }
    }
  } catch (err) {
    // Log but always return 200 to stop Meta retries
    console.error("[fb-webhook] Queue error:", err);
  }

  return NextResponse.json({ received: true });
}

// ─── Payload types ────────────────────────────────────────────────────────────

interface MessengerWebhookPayload {
  object: string;
  entry:  MessengerEntry[];
}

interface MessengerEntry {
  id:        string;           // Facebook Page ID
  time:      number;
  messaging: MessengerEvent[];
}

interface MessengerEvent {
  sender:    { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid:          string;
    text?:        string;
    is_echo?:     boolean;
    attachments?: Array<{
      type:    string;
      payload: { url?: string; title?: string; sticker_id?: number };
    }>;
  };
  postback?: {
    title:   string;
    payload: string;
    mid?:    string;
  };
  read?:     { watermark: number };
  delivery?: { watermark: number; mids?: string[] };
}
