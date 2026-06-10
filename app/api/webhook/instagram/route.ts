// Instagram / Meta Webhook
//
// GET  — hub.verify_token handshake (Meta subscription verification)
// POST — X-Hub-Signature-256 verification + event ingestion
//
// Architecture:
//   - Validates signature with HMAC-SHA256 (INSTAGRAM_APP_SECRET)
//   - Deduplicates via instagram_webhook_events (handled in processor)
//   - Enqueues events to BullMQ — no DB writes here
//   - Response time target: <50ms
//   - Always returns 200 on valid events (prevents Meta retry storms)
//
// Required env vars:
//   INSTAGRAM_APP_SECRET (or META_APP_SECRET)
//   INSTAGRAM_WEBHOOK_VERIFY_TOKEN

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getProducerRedis } from "@/lib/redis/client";
import { enqueueIGMessage, enqueueIGComment } from "@/lib/queue/producers";
import type { IGMessageJob, IGCommentJob } from "@/lib/queue/types";

// ─── GET — webhook verification handshake ─────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = (process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? "").trim();

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn("[ig-webhook] GET verification failed", {
    modeOk: mode === "subscribe",
    tokenOk: token === verifyToken,
    hasChallenge: !!challenge,
  });

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ─── POST — event ingestion ───────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.arrayBuffer();
  const bodyBuffer = Buffer.from(rawBody);

  // ── Signature verification ──────────────────────────────────────────────
  const signature = (req.headers.get("x-hub-signature-256") ?? "").trim();
  if (!verifySignature(bodyBuffer, signature)) {
    console.error("[ig-webhook] Signature verification failed — dropping event");
    // Forensic capture of mismatch
    try {
      const secret = (process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET || "").trim();
      const expected = `sha256=${createHmac("sha256", secret).update(bodyBuffer).digest("hex")}`;
      await getProducerRedis().set("forensic:ig:last-mismatch", JSON.stringify({
        expectedFull: expected,
        receivedFull: signature,
        bodyPreview: bodyBuffer.toString("utf8").substring(0, 200),
        time: new Date().toISOString()
      }), "EX", 3600);
    } catch {}
    return NextResponse.json({ received: false }, { status: 200 });
  }

  // ── Parse payload ───────────────────────────────────────────────────────
  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(bodyBuffer.toString("utf8")) as MetaWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.object !== "instagram") {
    return NextResponse.json({ received: true });
  }

  const receivedAt = new Date().toISOString();

  try {
    for (const entry of payload.entry ?? []) {
      const pageId = entry.id;

      // ── DMs and messaging events ────────────────────────────────────────
      for (const msg of entry.messaging ?? []) {
        if (!msg.message?.mid) continue;

        const job: IGMessageJob = {
          accountId:   "",   // resolved by worker via pageId lookup
          userId:      "",   // resolved by worker
          workspaceId: "",   // resolved by worker
          pageId,
          senderId:    msg.sender.id,
          recipientId: msg.recipient.id,
          mid:         msg.message.mid,
          text:        msg.message.text ?? null,
          attachments: msg.message.attachments ?? null,
          timestamp:   msg.timestamp,
          isEcho:      msg.message.is_echo === true,
          receivedAt,
        };

        await enqueueIGMessage(job);
      }

      // ── Field change events (comments, mentions) ────────────────────────
      for (const change of entry.changes ?? []) {
        if (change.field !== "comments" && change.field !== "mentions") continue;
        const v = change.value;
        if (!v?.id) continue;

        const job: IGCommentJob = {
          accountId:    "",
          userId:       "",
          workspaceId:  "",
          commentId:    v.id,
          mediaId:      v.media?.id ?? "",
          mediaType:    v.media?.media_type,
          fromIgUserId: v.from?.id ?? "",
          fromUsername: v.from?.username ?? null,
          text:         v.text ?? "",
          parentCommentId: v.parent_id ?? undefined,
          timestamp:    entry.time ?? Math.floor(Date.now() / 1000),
          receivedAt,
        };

        await enqueueIGComment(job);
      }
    }
  } catch (err) {
    // Log but always return 200 — prevents Meta from flooding with retries
    console.error("[ig-webhook] Queue error:", err);
  }

  return NextResponse.json({ received: true });
}

// ─── Signature verification ───────────────────────────────────────────────────

function verifySignature(body: Buffer, signature: string): boolean {
  const secret = (
    process.env.INSTAGRAM_APP_SECRET ||
    process.env.META_APP_SECRET ||
    ""
  ).trim();

  if (!secret) {
    console.error("[ig-webhook] INSTAGRAM_APP_SECRET is not configured");
    return false;
  }

  if (!signature.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    // timingSafeEqual throws if buffers have different lengths
    return false;
  }
}

// ─── Payload types ────────────────────────────────────────────────────────────

interface MetaWebhookPayload {
  object: string;
  entry:  MetaEntry[];
}

interface MetaEntry {
  id:        string;   // Facebook Page ID
  time:      number;
  messaging?: MetaMessagingEvent[];
  changes?:   MetaChangeEvent[];
}

interface MetaMessagingEvent {
  sender:    { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid:          string;
    text?:        string;
    is_echo?:     boolean;
    attachments?: Array<{
      type:    string;
      payload: { url?: string; sticker_id?: number; title?: string };
    }>;
  };
}

interface MetaChangeEvent {
  field: string;
  value: {
    id?:        string;
    text?:      string;
    parent_id?: string;
    from?:      { id: string; username?: string };
    media?:     { id: string; media_type?: string };
  };
}
