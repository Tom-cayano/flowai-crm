// lib/ai/draft-manager.ts
// CRUD helpers for ai_reply_drafts.
// All writes use admin client; reads via auth-scoped client in API routes.

import { createAdminClient } from "@/lib/supabase/admin";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DraftStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "auto_sent";

export interface AIReplyDraft {
  id:                string;
  userId:            string;
  conversationId:    string;
  content:           string;
  status:            DraftStatus;
  confidence:        number | null;
  intent:            string | null;
  model:             string | null;
  promptTokens:      number | null;
  completionTokens:  number | null;
  latencyMs:         number | null;
  triggerMessageId:  string | null;
  triggerContent:    string | null;
  approvedBy:        string | null;
  approvedAt:        string | null;
  rejectionNote:     string | null;
  expiresAt:         string;
  createdAt:         string;
}

export interface CreateDraftOpts {
  userId:           string;
  conversationId:   string;
  content:          string;
  confidence?:      number | null;
  intent?:          string | null;
  model?:           string | null;
  promptTokens?:    number | null;
  completionTokens?: number | null;
  latencyMs?:       number | null;
  triggerMessageId?: string | null;
  triggerContent?:  string | null;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createDraft(opts: CreateDraftOpts): Promise<AIReplyDraft | null> {
  const db  = createAdminClient();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes

  const { data, error } = await (db as any)
    .from("ai_reply_drafts")
    .insert({
      user_id:           opts.userId,
      conversation_id:   opts.conversationId,
      content:           opts.content,
      status:            "pending",
      confidence:        opts.confidence        ?? null,
      intent:            opts.intent            ?? null,
      model:             opts.model             ?? null,
      prompt_tokens:     opts.promptTokens      ?? null,
      completion_tokens: opts.completionTokens  ?? null,
      latency_ms:        opts.latencyMs         ?? null,
      trigger_message_id: opts.triggerMessageId ?? null,
      trigger_content:   opts.triggerContent    ?? null,
      expires_at:        expiresAt.toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) return null;
  return mapDraft(data);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/** Get the latest pending draft for a conversation (for inbox display). */
export async function getPendingDraft(
  conversationId: string
): Promise<AIReplyDraft | null> {
  const db = createAdminClient();
  const { data } = await (db as any)
    .from("ai_reply_drafts")
    .eq("conversation_id", conversationId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? mapDraft(data) : null;
}

/** Get all pending drafts for a user across all conversations (for mass inbox). */
export async function getAllPendingDrafts(userId: string): Promise<any[]> {
  const db = createAdminClient();
  const { data } = await (db as any)
    .from("ai_reply_drafts")
    .select(`
      *,
      conversation:conversations (
        channel,
        contact:contacts (
          name,
          phone,
          avatar
        )
      )
    `)
    .eq("user_id", userId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  // Map the raw data but keep the joined objects
  return data ? data.map((row: any) => ({
    ...mapDraft(row),
    conversation: row.conversation
  })) : [];
}

/** Get a single draft by ID — used by approve/reject routes. */
export async function getDraftById(id: string): Promise<AIReplyDraft | null> {
  const db = createAdminClient();
  const { data } = await (db as any)
    .from("ai_reply_drafts")
    .eq("id", id)
    .maybeSingle();

  return data ? mapDraft(data) : null;
}

/** Count consecutive rejections by a user — used to trigger auto-escalation. */
export async function countRecentRejections(
  userId:         string,
  conversationId: string,
  lookbackCount   = 3
): Promise<number> {
  const db = createAdminClient();
  const { data } = await (db as any).from("ai_reply_drafts")
    .select("status")
    .eq("user_id", userId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(lookbackCount);

  if (!data) return 0;
  return data.filter((d: any) => d.status === "rejected").length;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function approveDraft(
  id:         string,
  approvedBy: string
): Promise<boolean> {
  const db = createAdminClient();
  const { error } = await (db as any)
    .from("ai_reply_drafts")
    .update({
      status:      "approved",
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending"); // only pending drafts can be approved

  return !error;
}

export async function rejectDraft(
  id:            string,
  rejectionNote?: string
): Promise<boolean> {
  const db = createAdminClient();
  const { error } = await (db as any)
    .from("ai_reply_drafts")
    .update({
      status:         "rejected",
      rejection_note: rejectionNote ?? null,
      updated_at:     new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");

  return !error;
}

export async function markDraftAutoSent(id: string): Promise<void> {
  const db = createAdminClient();
  await (db as any)
    .from("ai_reply_drafts")
    .update({ status: "auto_sent", updated_at: new Date().toISOString() })
    .eq("id", id);
}

/** Expire all stale pending drafts for a user (call periodically or on new draft creation). */
export async function expireOldDrafts(userId: string): Promise<void> {
  const db = createAdminClient();
  await (db as any)
    .from("ai_reply_drafts")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

export async function recordFeedback(opts: {
  draftId:       string;
  userId:        string;
  rating:        "thumbs_up" | "thumbs_down" | "edited";
  editedContent?: string;
}): Promise<void> {
  const db = createAdminClient();
  await (db as any).from("ai_reply_feedback").insert({
    draft_id:       opts.draftId,
    user_id:        opts.userId,
    rating:         opts.rating,
    edited_content: opts.editedContent ?? null,
  });
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapDraft(row: Record<string, unknown>): AIReplyDraft {
  return {
    id:               row.id as string,
    userId:           row.user_id as string,
    conversationId:   row.conversation_id as string,
    content:          row.content as string,
    status:           row.status as DraftStatus,
    confidence:       row.confidence !== null ? Number(row.confidence) : null,
    intent:           row.intent as string | null,
    model:            row.model as string | null,
    promptTokens:     row.prompt_tokens !== null ? Number(row.prompt_tokens) : null,
    completionTokens: row.completion_tokens !== null ? Number(row.completion_tokens) : null,
    latencyMs:        row.latency_ms !== null ? Number(row.latency_ms) : null,
    triggerMessageId: row.trigger_message_id as string | null,
    triggerContent:   row.trigger_content as string | null,
    approvedBy:       row.approved_by as string | null,
    approvedAt:       row.approved_at as string | null,
    rejectionNote:    row.rejection_note as string | null,
    expiresAt:        row.expires_at as string,
    createdAt:        row.created_at as string,
  };
}
