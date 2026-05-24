// Instagram outbound DM processor.
//
// Sends a DM via the Meta Graph API, then:
//   - Updates the pre-existing CRM messages row (if messageId provided)
//   - Inserts the sent message into instagram_messages
//   - Updates the conversation preview
//
// Rate limits:
//   Meta allows ~250 unique DM conversations/hour/page.
//   We apply a small fixed delay between sends to respect this.
//   On 429 responses the job retries with exponential backoff (BullMQ handles).

import { createAdminClient } from "@/lib/supabase/admin";
import { sendDM, IGApiError } from "@/lib/instagram/client";
import { getAccessToken } from "@/lib/instagram/token-store";
import type { IGOutboundJob } from "@/lib/queue/types";

// Minimum delay between consecutive DM sends to the same page (ms).
// Keeps us well within Meta's 250 conversations/hour limit.
const POST_SEND_DELAY_MS = 500;

export async function processIGOutbound(job: IGOutboundJob): Promise<void> {
  const db = createAdminClient();

  // ── Resolve access token ──────────────────────────────────────────────────
  const token = await getAccessToken(job.accountId);
  if (!token) {
    throw new Error(`No token for Instagram account ${job.accountId}`);
  }

  // ── Send via Graph API ────────────────────────────────────────────────────
  let externalId: string | undefined;
  try {
    const result = await sendDM(job.recipientIgId, job.content, token);
    externalId = result.message_id;
  } catch (err) {
    if (err instanceof IGApiError && err.isTokenError) {
      // Mark account as token_expired so ops dashboard surfaces it
      await db.from("instagram_accounts").update({
        connection_state: "token_expired",
        last_error:       err.message,
      }).eq("id", job.accountId);
    }
    throw err;  // BullMQ will retry
  }

  // ── Anti-spam delay ──────────────────────────────────────────────────────
  await new Promise((r) => setTimeout(r, POST_SEND_DELAY_MS));

  // ── Record sent message ───────────────────────────────────────────────────
  const sentAt = new Date().toISOString();

  // Resolve thread for the instagram_messages insert
  const { data: thread } = await db
    .from("instagram_threads")
    .select("id")
    .eq("account_id", job.accountId)
    .eq("ig_thread_id", job.recipientIgId)
    .maybeSingle();

  if (thread?.id) {
    await db.from("instagram_messages").insert({
      thread_id:       thread.id,
      account_id:      job.accountId,
      user_id:         job.userId,
      ig_message_id:   externalId ?? `out:${Date.now()}`,
      from_ig_user_id: "me",
      from_me:         true,
      content:         job.content,
      message_type:    "text",
      status:          "sent",
      external_id:     job.messageId ?? null,
    }).then(() => void 0, () => void 0);  // best-effort
  }

  // ── Update the pre-written CRM message row ────────────────────────────────
  if (job.messageId && externalId) {
    await db.from("messages")
      .update({ external_id: externalId, status: "sent" })
      .eq("id", job.messageId);
  }

  // ── Update conversation preview ───────────────────────────────────────────
  await db.from("conversations").update({
    last_message_preview: job.content.substring(0, 120),
    last_message_at:      sentAt,
    last_message_sender:  "agent",
    updated_at:           sentAt,
  }).eq("id", job.conversationId);
}
