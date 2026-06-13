// FlowAI CRM — Unified Meta Webhook
//
// Single endpoint that handles all three Meta messaging channels:
//   object: "whatsapp_business_account" → WhatsApp Cloud API
//   object: "instagram"                 → Instagram DM / comments
//   object: "page"                      → Facebook Messenger
//
// This route exists alongside the legacy per-channel routes:
//   /api/webhook/whatsapp   — Evolution API (WhatsApp via proxy)
//   /api/webhook/instagram  — Instagram (can also point here)
//   /api/webhook/facebook   — Messenger (can also point here)
//
// Configure ONE Meta App webhook pointing to this URL.
// The hub.verify_token used for handshake: META_WEBHOOK_VERIFY_TOKEN env var.
//
// Security: X-Hub-Signature-256 verified with META_APP_SECRET before any
// payload processing. Raw body is buffered before JSON.parse — critical.
//
// Response time target: < 50 ms. All processing happens in workers.

import { NextRequest, NextResponse } from "next/server";
import { verifyMetaSignature } from "@/lib/meta/webhook-validator";
import { processWACStatusBatch } from "@/lib/meta/wac-status";
import { getRedis } from "@/lib/redis/client";
import {
  enqueueWACMessage,
  enqueueIGMessage,
  enqueueIGComment,
  enqueueFBMessage,
} from "@/lib/queue/producers";
import type { WACMessageJob, IGMessageJob, IGCommentJob, FBMessageJob } from "@/lib/queue/types";

// ─── GET — webhook verification handshake ─────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "";

  if (!verifyToken) {
    console.error("[meta-webhook] META_WEBHOOK_VERIFY_TOKEN not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (mode === "subscribe" && token === verifyToken && challenge) {
    console.log("[meta-webhook] Webhook verified by Meta");
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn("[meta-webhook] Verification failed", { mode, tokenMatch: token === verifyToken });
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ─── POST — event ingestion ───────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const start = Date.now();

  // ── Redis rate limiting — 2 000 req/min per app ───────────────────────────
  try {
    const redis  = getRedis();
    const bucket = `rl:meta-webhook:${Math.floor(Date.now() / 60_000)}`;
    const count  = await redis.incr(bucket);
    if (count === 1) await redis.expire(bucket, 120);
    if (count > 2_000) {
      console.warn("[meta-webhook] Rate limit exceeded");
      return NextResponse.json({ received: true }, { status: 200 });
    }
  } catch {
    // Redis unavailable — let request through rather than dropping real events
  }

  const rawBody    = await req.arrayBuffer();
  const bodyBuffer = Buffer.from(rawBody);

  // ── HMAC-SHA256 signature verification ───────────────────────────────────
  const signature  = req.headers.get("x-hub-signature-256") ?? "";
  const appSecret  = process.env.META_APP_SECRET ?? "";

  if (!verifyMetaSignature(bodyBuffer, signature, appSecret)) {
    console.warn("[meta-webhook] Signature mismatch — dropping event");
    // Always 200 to prevent Meta from flooding with retries
    return NextResponse.json({ received: false }, { status: 200 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(bodyBuffer.toString("utf8")) as MetaWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const receivedAt = new Date().toISOString();

  try {
    switch (payload.object) {
      case "whatsapp_business_account":
        await handleWhatsAppCloud(payload, receivedAt);
        break;
      case "instagram":
        await handleInstagram(payload, receivedAt);
        break;
      case "page":
        await handleMessenger(payload, receivedAt);
        break;
      default:
        // Ack unknown objects silently — prevents Meta retries
        break;
    }
  } catch (err) {
    console.error("[meta-webhook] Queue error:", err);
  }

  console.debug(`[meta-webhook] processed object=${payload.object} elapsed=${Date.now() - start}ms`);
  return NextResponse.json({ received: true });
}

// ─── WhatsApp Cloud API handler ───────────────────────────────────────────────

async function handleWhatsAppCloud(
  payload:    MetaWebhookPayload,
  receivedAt: string,
): Promise<void> {
  for (const entry of payload.entry ?? []) {
    const wabaId = entry.id;

    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;

      const value         = change.value as WACValue;
      const phoneNumberId = value?.metadata?.phone_number_id ?? "";

      // ── Incoming messages ────────────────────────────────────────────────
      for (const msg of value?.messages ?? []) {
        const wamid = msg.id;
        if (!wamid) continue;

        // Resolve sender display name from contacts array
        const senderName =
          value.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ?? null;

        const job: WACMessageJob = {
          accountId:      "",   // resolved by worker via phoneNumberId lookup
          userId:         "",
          workspaceId:    "",
          phoneNumberId,
          wabaId,
          from:           msg.from,
          senderName,
          wamid,
          type:           msg.type,
          text:           msg.text?.body ?? null,
          mediaId:        (msg.image ?? msg.audio ?? msg.video ?? msg.document ?? msg.sticker)?.id,
          mediaMimeType:  (msg.image ?? msg.audio ?? msg.video ?? msg.document)?.mime_type,
          mediaCaption:   (msg.image ?? msg.video ?? msg.document)?.caption,
          latitude:       msg.location?.latitude,
          longitude:      msg.location?.longitude,
          timestamp:      Number(msg.timestamp),
          isEcho:         false,
          receivedAt,
        };

        await enqueueWACMessage(job);
      }

      // ── Status updates (delivered / read / failed / read) ───────────────
      const statuses = value?.statuses ?? [];
      if (statuses.length > 0) {
        // Persist delivery state to messages table (fire-and-forget)
        processWACStatusBatch(statuses).catch((err) =>
          console.warn("[meta-webhook] WAC status batch failed:", err)
        );
      }
    }
  }
}

// ─── Instagram handler ────────────────────────────────────────────────────────

async function handleInstagram(
  payload:    MetaWebhookPayload,
  receivedAt: string,
): Promise<void> {
  for (const entry of payload.entry ?? []) {
    const pageId = entry.id;

    for (const msg of entry.messaging ?? []) {
      if (!msg.message?.mid) continue;

      const job: IGMessageJob = {
        accountId:      "",
        userId:         "",
        workspaceId:    "",
        pageId,
        senderId:       msg.sender.id,
        senderUsername: msg.sender.username ?? null,
        recipientId:    msg.recipient.id,
        mid:            msg.message.mid,
        text:           msg.message.text ?? null,
        attachments:    msg.message.attachments ?? null,
        timestamp:      msg.timestamp,
        isEcho:         msg.message.is_echo === true,
        receivedAt,
      };

      await enqueueIGMessage(job);
    }

    for (const change of entry.changes ?? []) {
      if (change.field !== "comments" && change.field !== "mentions") continue;
      const v = change.value as IGChangeValue;
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
}

// ─── Messenger handler ────────────────────────────────────────────────────────

async function handleMessenger(
  payload:    MetaWebhookPayload,
  receivedAt: string,
): Promise<void> {
  for (const entry of payload.entry ?? []) {
    const pageId = entry.id;

    for (const event of entry.messaging ?? []) {
      if (!event.message?.mid) continue;

      const job: FBMessageJob = {
        pageId,
        senderId:    event.sender.id,
        recipientId: event.recipient.id,
        mid:         event.message.mid,
        text:        event.message.text ?? null,
        attachments: event.message.attachments ?? null,
        timestamp:   event.timestamp,
        isEcho:      event.message.is_echo === true,
        receivedAt,
      };

      await enqueueFBMessage(job);
    }
  }
}

// ─── Payload types ────────────────────────────────────────────────────────────

interface MetaWebhookPayload {
  object: string;
  entry:  MetaEntry[];
}

interface MetaEntry {
  id:        string;
  time?:     number;
  changes?:  MetaChange[];
  messaging?: MetaMessagingEvent[];
}

interface MetaChange {
  field: string;
  value: unknown;
}

interface IGChangeValue {
  id?:         string;
  media?:      { id: string; media_type?: string };
  from?:       { id: string; username?: string };
  text?:       string;
  parent_id?:  string;
}

interface MetaMessagingEvent {
  sender:    { id: string; username?: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid:          string;
    text?:        string;
    is_echo?:     boolean;
    attachments?: Array<{ type: string; payload: { url?: string; sticker_id?: number; title?: string } }>;
  };
}

// WhatsApp Cloud API value shape
interface WACValue {
  messaging_product: string;
  metadata:          { display_phone_number: string; phone_number_id: string };
  contacts?:         Array<{ wa_id: string; profile: { name: string } }>;
  messages?:         WACMessage[];
  statuses?:         WACStatus[];
}

interface WACMessage {
  id:        string;   // wamid
  from:      string;   // sender phone (E.164 without +)
  timestamp: string;   // unix seconds as string
  type:      string;
  text?:     { body: string };
  image?:    { id: string; mime_type: string; caption?: string };
  audio?:    { id: string; mime_type: string };
  video?:    { id: string; mime_type: string; caption?: string };
  document?: { id: string; mime_type: string; caption?: string; filename?: string };
  sticker?:  { id: string; mime_type: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
}

interface WACStatus {
  id:           string;   // wamid
  status:       "sent" | "delivered" | "read" | "failed";
  timestamp:    string;
  recipient_id: string;
}
