// WhatsApp Cloud API outbound message processor.
//
// Sends a text message via WhatsApp Cloud API, then:
//   - Updates the CRM message row with external_id (wamid) and status "sent"
//   - Updates conversation last_message_* fields
//
// Rate-limited by the queue (concurrency = 2, exponential backoff on failure).

import { createAdminClient } from "@/lib/supabase/admin";
import { sendText } from "@/lib/meta/whatsapp";
import { decryptToken } from "@/lib/instagram/token-store";
import type { WACOutboundJob } from "@/lib/queue/types";

type DB = ReturnType<typeof createAdminClient>;

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function processWACOutbound(job: WACOutboundJob): Promise<void> {
  const db = createAdminClient();

  // ── Resolve account ────────────────────────────────────────────────────────
  const account = await resolveAccount(db, job.accountId);
  if (!account) {
    throw new Error(`[wac-out] Account not found: ${job.accountId}`);
  }

  const { phoneNumberId, accessToken } = account;

  // ── Send via Cloud API ─────────────────────────────────────────────────────
  const result = await sendText(
    phoneNumberId,
    job.to.replace(/^\+/, ""),   // Cloud API expects E.164 without +
    job.content,
    accessToken,
  );

  const wamid = result.messages[0]?.id ?? null;

  // ── Update CRM message row ─────────────────────────────────────────────────
  if (job.messageId) {
    await db.from("messages")
      .update({
        status:      "sent",
        external_id: wamid,
      })
      .eq("id", job.messageId);
  } else {
    // No pre-existing row — insert a new sent message
    await db.from("messages").insert({
      conversation_id: job.conversationId,
      content:         job.content,
      type:            "text",
      sender:          "agent",
      status:          "sent",
      external_id:     wamid,
    });
  }

  // ── Update conversation preview ────────────────────────────────────────────
  await db.from("conversations").update({
    last_message_preview: job.content.substring(0, 120),
    last_message_at:      new Date().toISOString(),
    last_message_sender:  "agent",
    updated_at:           new Date().toISOString(),
  }).eq("id", job.conversationId);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveAccount(
  db:        DB,
  accountId: string,
): Promise<{ phoneNumberId: string; accessToken: string } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from("whatsapp_cloud_accounts")
    .select("phone_number_id, access_token_enc")
    .eq("id", accountId)
    .eq("is_active", true)
    .maybeSingle() as { data: { phone_number_id: string; access_token_enc: string } | null };

  if (!data?.access_token_enc) return null;

  try {
    const accessToken = decryptToken(data.access_token_enc);
    return { phoneNumberId: data.phone_number_id, accessToken };
  } catch (err) {
    console.error("[wac-out] Token decryption failed:", err);
    return null;
  }
}
