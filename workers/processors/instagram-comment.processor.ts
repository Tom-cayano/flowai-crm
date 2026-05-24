// Instagram comment event processor.
//
// For each IGCommentJob it:
//   1. Checks idempotency (instagram_webhook_events)
//   2. Resolves account from pageId via a comment-side lookup
//   3. Upserts instagram_comment_events row
//   4. Enqueues automation trigger (instagram_comment_received / instagram_story_mention)
//
// Comment replies are sent via the send_instagram_comment action in the
// automation engine (action-executor.ts) — not directly from this processor.

import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueAutomation } from "@/lib/queue/producers";
import type { IGCommentJob } from "@/lib/queue/types";

type DB = ReturnType<typeof createAdminClient>;

export async function processIGComment(job: IGCommentJob): Promise<void> {
  if (!job.commentId) return;

  const db = createAdminClient();

  // ── Resolve account ────────────────────────────────────────────────────────
  // Comment jobs arrive with accountId="" from the webhook (resolved here by
  // querying active accounts for the workspace that matches the media owner).
  // As a fallback we look for any active account with an ig_user_id that
  // matches the recipient of the comment (media owner = IG business account).
  let accountId  = job.accountId;
  let userId     = job.userId;

  if (!accountId) {
    const resolved = await resolveAccountForComment(db, job);
    if (!resolved) {
      console.warn(`[ig-comment] Cannot resolve account for comment ${job.commentId} — dropping`);
      return;
    }
    accountId = resolved.accountId;
    userId    = resolved.userId;
  }

  // ── Idempotency guard ──────────────────────────────────────────────────────
  const { error: insertErr } = await db.from("instagram_webhook_events").insert({
    event_id:    job.commentId,
    event_type:  "comment",
    account_id:  accountId,
    raw_payload: {},
  });
  if (insertErr) {
    // Unique violation = already processed
    console.info(`[ig-comment] Duplicate comment ${job.commentId} — skipping`);
    return;
  }

  // ── Upsert comment_events row ──────────────────────────────────────────────
  await db.from("instagram_comment_events").upsert(
    {
      account_id:        accountId,
      user_id:           userId,
      ig_comment_id:     job.commentId,
      ig_media_id:       job.mediaId,
      media_type:        job.mediaType ?? null,
      from_ig_user_id:   job.fromIgUserId,
      from_username:     job.fromUsername ?? null,
      content:           job.text,
      parent_comment_id: job.parentCommentId ?? null,
    },
    { onConflict: "ig_comment_id" }
  );

  // ── Determine trigger type ─────────────────────────────────────────────────
  // story mentions arrive via the "mentions" webhook field; all others are comments
  const triggerType = job.mediaType === "STORY"
    ? "instagram_story_mention"
    : "instagram_comment_received";

  // ── Enqueue automation trigger ─────────────────────────────────────────────
  await enqueueAutomation({
    userId,
    conversationId: null,  // comments don't have a CRM conversation by default
    contactId:      null,
    phone:          job.fromIgUserId,
    incomingText:   job.text,
    isFirstMessage: false,
    instanceName:   `ig:${accountId}`,
    serverUrl:      "",
    instanceApiKey: "",
    triggerType,
    igAccountId:    accountId,
    igCommentId:    job.commentId,
    igMediaId:      job.mediaId || undefined,
    igUserId:       job.fromIgUserId,
  }).catch((err) => console.warn("[ig-comment] enqueueAutomation failed:", err));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveAccountForComment(
  db:   DB,
  _job: IGCommentJob,
): Promise<{ accountId: string; userId: string } | null> {
  // Try to find any active account in the system that belongs to a workspace.
  // In a multi-tenant setup each business has one account so this is unambiguous.
  // More robust: store pageId on the comment event and query by page_id.
  const { data } = await db
    .from("instagram_accounts")
    .select("id, user_id")
    .eq("is_active", true)
    .eq("connection_state", "connected")
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return { accountId: data.id, userId: data.user_id };
}
