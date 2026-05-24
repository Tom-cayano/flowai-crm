// Human handoff execution — records the escalation event in ai_handoffs
// and marks the conversation so the inbox knows it needs a human.

import { createAdminClient } from "@/lib/supabase/admin";
import type { HandoffReason } from "@/types/automation";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("ai:handoff");

export interface HandoffOpts {
  userId:            string;
  conversationId:    string;
  reason:            HandoffReason | "low_confidence";
  confidence?:       number;
  triggeredMessage?: string;
}

export async function executeHandoff(opts: HandoffOpts): Promise<void> {
  const db = createAdminClient();

  // 1. Record the handoff event
  await db.from("ai_handoffs").insert({
    user_id:           opts.userId,
    conversation_id:   opts.conversationId,
    reason:            opts.reason,
    confidence:        opts.confidence ?? null,
    triggered_message: opts.triggeredMessage ?? null,
  });

  // 2. Mark conversation as pending so it surfaces in the inbox
  await db
    .from("conversations")
    .update({ status: "pending" })
    .eq("id", opts.conversationId)
    .eq("user_id", opts.userId);

  log.info("handoff executed", {
    conversationId: opts.conversationId,
    reason:         opts.reason,
    confidence:     opts.confidence,
  });
}

export async function resolveHandoff(
  handoffId:  string,
  resolvedBy: string
): Promise<void> {
  const db = createAdminClient();
  await db
    .from("ai_handoffs")
    .update({ resolved_at: new Date().toISOString(), resolved_by: resolvedBy })
    .eq("id", handoffId);
}

export async function getActiveHandoffs(userId: string): Promise<Array<{
  id:             string;
  conversationId: string;
  reason:         string;
  createdAt:      string;
}>> {
  const db = createAdminClient();
  const { data } = await db
    .from("ai_handoffs")
    .select("id, conversation_id, reason, created_at")
    .eq("user_id", userId)
    .is("resolved_at", null)
    .order("created_at", { ascending: false });

  return (data ?? []).map((r) => ({
    id:             r.id,
    conversationId: r.conversation_id,
    reason:         r.reason,
    createdAt:      r.created_at,
  }));
}
