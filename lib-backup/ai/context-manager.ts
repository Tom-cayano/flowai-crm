// Manages the ai_context table — per-conversation rolling summary + facts.
// The AI orchestrator calls this before/after each AI turn.

import { createAdminClient } from "@/lib/supabase/admin";

export interface AIContext {
  summary: string | null;
  facts: Record<string, unknown>;
  messageWindow: number;
  tokensUsed: number;
}

const DEFAULT_WINDOW = 20;

/** Read context for a conversation. Returns defaults if row doesn't exist. */
export async function getAIContext(
  userId: string,
  conversationId: string
): Promise<AIContext> {
  const db = createAdminClient();

  const { data } = await db
    .from("ai_context")
    .select("summary, facts, message_window, tokens_used")
    .eq("conversation_id", conversationId)
    .maybeSingle();

  return {
    summary:       data?.summary ?? null,
    facts:         (data?.facts as Record<string, unknown>) ?? {},
    messageWindow: data?.message_window ?? DEFAULT_WINDOW,
    tokensUsed:    data?.tokens_used ?? 0,
  };
}

/** Upsert context after an AI turn. */
export async function updateAIContext(
  userId: string,
  conversationId: string,
  patch: Partial<AIContext> & { additionalTokens?: number }
): Promise<void> {
  const db = createAdminClient();

  const current = await getAIContext(userId, conversationId);
  const newTokens = current.tokensUsed + (patch.additionalTokens ?? 0);

  await db.from("ai_context").upsert({
    user_id:         userId,
    conversation_id: conversationId,
    summary:         patch.summary ?? current.summary,
    facts:           (patch.facts ?? current.facts) as import("@/types/supabase").Json,
    message_window:  patch.messageWindow ?? current.messageWindow,
    tokens_used:     newTokens,
    updated_at:      new Date().toISOString(),
  }, { onConflict: "conversation_id" });
}

/** Append a key fact learned about the contact. */
export async function appendFact(
  userId: string,
  conversationId: string,
  key: string,
  value: unknown
): Promise<void> {
  const current = await getAIContext(userId, conversationId);
  await updateAIContext(userId, conversationId, {
    facts: { ...current.facts, [key]: value },
  });
}
