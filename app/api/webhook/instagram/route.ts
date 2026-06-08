// Instagram / Meta Webhook — intentionally THIN.
// Validates, deduplicates, and enqueues. No DB writes here.
//
// Response time target: <50ms
// Meta retries any non-2xx response, which would create duplicate jobs.
// All actual processing happens in workers/processors/instagram-*.
//
// Webhook events handled:
//   messaging.messages     — incoming DMs (text, image, video, audio, share, story_mention)
//   messaging.messaging_reads  — read receipts
//   changes.comments       — comments on posts / reels
//   changes.mentions       — story mentions
//
// Security:
//   GET  — Meta hub.verify_token handshake
//   POST — X-Hub-Signature-256 (HMAC-SHA256 with INSTAGRAM_APP_SECRET)
//
// Must be in middleware PUBLIC_API_PREFIXES (no session cookie required).

import { NextRequest, NextResponse } from "next/server";
import { createHmac, createHash } from "crypto";
import { verifyWebhookSignature } from "@/lib/instagram/client";
import { enqueueIGMessage, enqueueIGComment } from "@/lib/queue/producers";
import { getProducerRedis } from "@/lib/redis/client";
import type { IGMessageJob, IGCommentJob } from "@/lib/queue/types";

// ─── GET — webhook verification handshake ─────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? "";

  console.log("[IG_WEBHOOK_DEBUG]", {
    mode,
    tokenLength: token?.length,
    verifyTokenLength: verifyToken?.length,
    tokenPrefix: token?.slice(0, 8),
    verifyTokenPrefix: verifyToken?.slice(0, 8),
    equal: token === verifyToken,
    equalTrimmed: token === verifyToken?.trim(),
  });

  // We add .trim() directly here as well to fix it proactively if it's the \n issue
  if (mode === "subscribe" && token === verifyToken?.trim() && challenge) {
    // Respond with the challenge value — Meta confirms the subscription
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ─── POST — event ingestion ───────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Buffer the body for signature verification (signature is over raw bytes)
  const rawBody    = await req.arrayBuffer();                  // L1: network → ArrayBuffer
  const hashL1     = createHash("sha256").update(Buffer.from(rawBody)).digest("hex");

  const bodyBuffer = Buffer.from(rawBody);                     // L2: ArrayBuffer → Buffer
  const hashL2     = createHash("sha256").update(bodyBuffer).digest("hex");

  // Content-Length header vs actual received bytes
  const contentLength = req.headers.get("content-length");

  console.log("[BODY HASH CHAIN]", {
    hashL1,                                          // SHA256 immediately after req.arrayBuffer()
    hashL2,                                          // SHA256 after Buffer.from(rawBody)
    hashesMatch:         hashL1 === hashL2,          // should always be true
    byteLength:          rawBody.byteLength,         // ArrayBuffer byte count
    bufferLength:        bodyBuffer.length,          // Buffer byte count
    contentLength,                                   // Content-Length header Meta declared
    contentLengthMatch:  contentLength
      ? parseInt(contentLength) === bodyBuffer.length
      : "header-absent",
  });

  // ── Signature headers — log all variants Meta could send ─────────────────
  const sigHeaders: Record<string, string | null> = {
    "x-hub-signature-256": req.headers.get("x-hub-signature-256"),
    "x-hub-signature":     req.headers.get("x-hub-signature"),
    "x-fb-signature":      req.headers.get("x-fb-signature"),
    "x-instagram-signature": req.headers.get("x-instagram-signature"),
  };
  console.log("[IG SIG HEADERS]", sigHeaders);

  // ── Signature verification ────────────────────────────────────────────────
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  if (!verifyWebhookSignature(bodyBuffer, signature)) {
    // Capture full forensic data in Redis for retrieval via GET /api/ops/debug-signature
    try {
      const secret       = (process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET || "").trim();
      const expectedFull = secret ? `sha256=${createHmac("sha256", secret).update(bodyBuffer).digest("hex")}` : "";
      const bodyHash     = createHash("sha256").update(bodyBuffer).digest("hex");
      const forensic = {
        timestamp:       new Date().toISOString(),
        signatureFull:   signature,
        expectedFull,
        bodyHash,
        bodyLength:      bodyBuffer.length,
        signatureLength: signature.length,
        expectedLength:  expectedFull.length,
        lengthsMatch:    signature.length === expectedFull.length,
        match:           signature === expectedFull,
        contentLength,
        contentLengthMatch: contentLength
          ? parseInt(contentLength) === bodyBuffer.length
          : "header-absent",
        hashL1,
        hashL2,
        hashChainIntact: hashL1 === hashL2,
        bodyPrefix:      bodyBuffer.toString("utf8").slice(0, 200),
        sigHeaders,
      };
      await getProducerRedis().set("forensic:ig:last-mismatch", JSON.stringify(forensic), "EX", 7200);
    } catch { /* Redis unavailable — don't block response */ }

    console.warn("[ig-webhook] Signature mismatch — dropping event");
    return NextResponse.json({ received: false }, { status: 200 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(bodyBuffer.toString("utf8")) as MetaWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only handle instagram object type
  if (payload.object !== "instagram") {
    return NextResponse.json({ received: true });
  }

  const receivedAt = new Date().toISOString();

  try {
    for (const entry of payload.entry ?? []) {
      const pageId = entry.id;

      // ── Messaging events (DMs, read receipts, echoes) ─────────────────────
      for (const msg of entry.messaging ?? []) {
        if (!msg.message) continue;

        const mid  = msg.message.mid;
        if (!mid) continue;

        // Resolve account by pageId — looked up in the worker to avoid DB here
        const job: IGMessageJob = {
          accountId:   "",   // resolved by worker via pageId lookup
          userId:      "",   // resolved by worker
          workspaceId: "",   // resolved by worker
          pageId,
          senderId:    msg.sender.id,
          recipientId: msg.recipient.id,
          mid,
          text:        msg.message.text ?? null,
          attachments: msg.message.attachments ?? null,
          timestamp:   msg.timestamp,
          isEcho:      msg.message.is_echo === true,
          receivedAt,
        };

        await enqueueIGMessage(job);
      }

      // ── Field change events (comments, mentions, story_mentions) ──────────
      for (const change of entry.changes ?? []) {
        if (change.field === "comments" || change.field === "mentions") {
          const v = change.value;
          if (!v?.id) continue;

          const job: IGCommentJob = {
            accountId:    "",   // resolved by worker via pageId
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
    }
  } catch (err) {
    // Log but always return 200 — prevents Meta from flooding with retries
    console.error("[ig-webhook] Queue error:", err);
  }

  return NextResponse.json({ received: true });
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
    id?:       string;
    text?:     string;
    parent_id?: string;
    from?:     { id: string; username?: string };
    media?:    { id: string; media_type?: string };
  };
}
