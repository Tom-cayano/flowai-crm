// Facebook Messenger Webhook — intentionally THIN.
// Validates signature, logs events, and returns 200 in <50ms.
// Meta retries any non-2xx, so we never throw from the POST handler.
//
// Events handled:
//   messaging.messages          — incoming text / attachments
//   messaging.messaging_reads   — read receipts
//   messaging.messaging_postbacks — button / quick-reply clicks
//   messaging.message_deliveries — delivery confirmations
//
// Security:
//   GET  — hub.verify_token handshake (FACEBOOK_VERIFY_TOKEN)
//   POST — X-Hub-Signature-256 HMAC-SHA256 (META_APP_SECRET)
//
// Already public: middleware PUBLIC_API_PREFIXES covers /api/webhook/
//
// TODO (Phase 5 — Messenger full integration):
//   1. Add messenger_* DB tables (migration)
//   2. Create BullMQ queues/producers: messengerMessage, messengerOutbound
//   3. Create workers/processors/messenger-message.processor.ts
//   4. Replace the console.log calls below with enqueueMessengerMessage(job)

import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

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
  // Buffer the raw body — signature is computed over raw bytes
  const rawBody    = await req.arrayBuffer();
  const bodyBuffer = Buffer.from(rawBody);

  // ── HMAC-SHA256 signature verification ───────────────────────────────────
  const appSecret = process.env.META_APP_SECRET ?? "";
  if (!appSecret) {
    console.error("[fb-webhook] META_APP_SECRET is not set — rejecting event");
    // Return 200 to prevent Meta from retrying forever
    return NextResponse.json({ received: false, reason: "misconfigured" }, { status: 200 });
  }

  const signature = req.headers.get("x-hub-signature-256") ?? "";
  if (!verifySignature(bodyBuffer, signature, appSecret)) {
    console.warn("[fb-webhook] Signature mismatch — dropping event");
    return NextResponse.json({ received: false }, { status: 200 });
  }

  // ── Parse payload ─────────────────────────────────────────────────────────
  let payload: MessengerWebhookPayload;
  try {
    payload = JSON.parse(bodyBuffer.toString("utf8")) as MessengerWebhookPayload;
  } catch {
    console.error("[fb-webhook] Invalid JSON body");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only handle page object type (Messenger sends object: "page")
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
        if (event.message && !event.message.is_echo) {
          const mid = event.message.mid;
          console.log("[fb-webhook] message | page=%s sender=%s mid=%s text=%s",
            pageId, senderId, mid, event.message.text ?? "(no text)");

          // TODO Phase 5: replace with enqueueMessengerMessage({
          //   pageId, senderId, recipientId: recipientId, mid,
          //   text: event.message.text ?? null,
          //   attachments: event.message.attachments ?? null,
          //   timestamp: event.timestamp,
          //   receivedAt,
          // });
          void recipientId; // suppress unused-var until Phase 5 wires this up
        }

        // ── Echo (message sent by the page) ────────────────────────────────
        if (event.message?.is_echo) {
          console.log("[fb-webhook] echo | page=%s mid=%s", pageId, event.message.mid);
        }

        // ── Postback (button / quick-reply click) ───────────────────────────
        if (event.postback) {
          console.log("[fb-webhook] postback | page=%s sender=%s payload=%s",
            pageId, senderId, event.postback.payload);
        }

        // ── Read receipt ────────────────────────────────────────────────────
        if (event.read) {
          console.log("[fb-webhook] read | page=%s sender=%s watermark=%d",
            pageId, senderId, event.read.watermark);
        }

        // ── Delivery confirmation ───────────────────────────────────────────
        if (event.delivery) {
          console.log("[fb-webhook] delivery | page=%s sender=%s watermark=%d",
            pageId, senderId, event.delivery.watermark);
        }
      }
    }
  } catch (err) {
    // Log but always return 200 to stop Meta retries
    console.error("[fb-webhook] Processing error:", err);
  }

  return NextResponse.json({ received: true });
}

// ─── HMAC-SHA256 signature verification ──────────────────────────────────────

function verifySignature(body: Buffer, signatureHeader: string, secret: string): boolean {
  // Header format: "sha256=<hex_digest>"
  if (!signatureHeader.startsWith("sha256=")) return false;
  const expected = signatureHeader.slice("sha256=".length);
  const hmac     = createHmac("sha256", secret).update(body).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(hmac, "hex"), Buffer.from(expected, "hex"));
  } catch {
    // Buffer lengths differ (malformed header) — reject
    return false;
  }
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
  read?: {
    watermark: number;
  };
  delivery?: {
    watermark: number;
    mids?:     string[];
  };
}
