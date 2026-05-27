// lib/ai/reply-metrics.ts
// Append-only event recorder for AI auto-reply analytics.
// Fire-and-forget: never throws, never blocks the AI pipeline.

import { createAdminClient } from "@/lib/supabase/admin";

// ─── Event types ──────────────────────────────────────────────────────────────

export type ReplyMetricEvent =
  | "draft_created"
  | "draft_approved"
  | "draft_rejected"
  | "draft_expired"
  | "auto_sent"
  | "handoff_triggered"
  | "fallback_approval"
  | "confidence_gate_passed"
  | "confidence_gate_failed"
  | "cooldown_blocked"
  | "business_hours_blocked"
  | "intent_blocked"
  | "quota_blocked"
  | "mode_off_skipped";

export interface ReplyMetricPayload {
  userId:          string;
  workspaceId?:    string | null;
  conversationId?: string | null;
  event:           ReplyMetricEvent;
  mode?:           string;
  confidence?:     number | null;
  intent?:         string | null;
  latencyMs?:      number | null;
  channel?:        string | null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Append a single analytics event to ai_reply_metrics.
 * Always fire-and-forget — wrap in void at call sites.
 */
export async function recordReplyEvent(
  payload: ReplyMetricPayload
): Promise<void> {
  try {
    const db = createAdminClient();
    await (db as any).from("ai_reply_metrics").insert({
      user_id:         payload.userId,
      workspace_id:    payload.workspaceId    ?? null,
      conversation_id: payload.conversationId ?? null,
      event:           payload.event,
      mode:            payload.mode           ?? null,
      confidence:      payload.confidence     ?? null,
      intent:          payload.intent         ?? null,
      latency_ms:      payload.latencyMs      ?? null,
      channel:         payload.channel        ?? null,
      occurred_at:     new Date().toISOString(),
    });
  } catch {
    // Metrics are best-effort — never surface errors to callers
  }
}
