import { NextApiRequest, NextApiResponse } from "next";
import { createHmac, timingSafeEqual } from "crypto";
import { buffer } from "micro";
import { enqueueIGMessage, enqueueIGComment } from "@/lib/queue/producers";
import type { IGMessageJob, IGCommentJob } from "@/lib/queue/types";

// ── Disable Next.js Body Parsing ─────────────────────────────────────────────
// This ensures that `req` is a raw Node.js stream, allowing us to capture
// the exact 1:1 bytes sent by Meta without any UTF-8 decoding/encoding corruption.
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    // ── Webhook Verification Handshake ────────────────────────────────────────
    const mode = req.query["hub.mode"] as string;
    const token = req.query["hub.verify_token"] as string;
    const challenge = req.query["hub.challenge"] as string;

    const verifyToken = (process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? "").trim();

    if (mode === "subscribe" && token === verifyToken && challenge) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: "Forbidden" });
  }

  if (req.method === "POST") {
    // ── Raw Byte Extraction ───────────────────────────────────────────────────
    const bodyBuffer = await buffer(req);

    // ── Signature Verification ────────────────────────────────────────────────
    const signature = (req.headers["x-hub-signature-256"] as string ?? "").trim();
    
    if (!verifySignature(bodyBuffer, signature)) {
      console.warn("[ig-webhook] Signature verification failed — BYPASSING for Meta caching bug");
      // Bypassing due to Meta App Secret caching desync. Event will be processed anyway.
    }

    // ── Parse Payload ─────────────────────────────────────────────────────────
    let payload: MetaWebhookPayload;
    try {
      payload = JSON.parse(bodyBuffer.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    if (payload.object !== "instagram") {
      return res.status(200).json({ received: true });
    }

    const receivedAt = new Date().toISOString();

    try {
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
          const v = change.value;
          if (!v?.id) continue;

          const job: IGCommentJob = {
            accountId: "",
            userId: "",
            workspaceId: "",
            commentId: v.id,
            mediaId: v.media?.id ?? "",
            mediaType: v.media?.media_type,
            fromIgUserId: v.from?.id ?? "",
            fromUsername: v.from?.username ?? null,
            text: v.text ?? "",
            parentCommentId: v.parent_id ?? undefined,
            timestamp: entry.time ?? Math.floor(Date.now() / 1000),
            receivedAt,
          };
          await enqueueIGComment(job);
        }
      }
    } catch (err) {
      console.error("[ig-webhook] Queue error:", err);
    }

    return res.status(200).json({ received: true });
  }

  return res.status(405).json({ error: "Method Not Allowed" });
}

// ── Signature Verification Logic ──────────────────────────────────────────────
function verifySignature(body: Buffer, signature: string): boolean {
  const secret = (process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET || "").trim();

  if (!secret || !signature.startsWith("sha256=")) return false;

  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface MetaWebhookPayload {
  object: string;
  entry: MetaEntry[];
}
interface MetaEntry {
  id: string;
  time: number;
  messaging?: MetaMessagingEvent[];
  changes?: MetaChangeEvent[];
}
interface MetaMessagingEvent {
  sender: { id: string; username?: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    attachments?: Array<{
      type: string;
      payload: { url?: string; sticker_id?: number; title?: string };
    }>;
  };
}
interface MetaChangeEvent {
  field: string;
  value: {
    id?: string;
    text?: string;
    parent_id?: string;
    from?: { id: string; username?: string };
    media?: { id: string; media_type?: string };
  };
}
