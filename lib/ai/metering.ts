// AI usage metering — records every OpenAI call to ai_usage_logs.
// Call recordUsage() after each API response. Never throws; metering
// must not interrupt the main AI pipeline.

import { createAdminClient } from "@/lib/supabase/admin";
import { estimateCostUSD } from "./client";

export type AIOperation =
  | "reply"
  | "summary"
  | "classify"
  | "embed"
  | "moderate"
  | "qualify"
  | "follow_up"
  | "suggest"
  | "rephrase"
  | "coach"
  | "knowledge"
  | "generate";

export interface UsageRecord {
  userId:           string;
  conversationId?:  string | null;
  model:            string;
  operation:        AIOperation;
  promptTokens:     number;
  completionTokens: number;
  latencyMs?:       number | null;
}

export async function recordUsage(record: UsageRecord): Promise<void> {
  try {
    const db         = createAdminClient();
    const totalTokens = record.promptTokens + record.completionTokens;
    const costUSD    = estimateCostUSD(record.model, record.promptTokens, record.completionTokens);

    await db.from("ai_usage_logs").insert({
      user_id:            record.userId,
      conversation_id:    record.conversationId ?? null,
      model:              record.model,
      operation:          record.operation,
      prompt_tokens:      record.promptTokens,
      completion_tokens:  record.completionTokens,
      total_tokens:       totalTokens,
      estimated_cost_usd: costUSD,
      latency_ms:         record.latencyMs ?? null,
    });
  } catch {
    // Best-effort — never block the AI pipeline on metering failures
  }
}

// ─── Usage aggregation for the ops/settings dashboard ────────────────────────

export interface UsageSummary {
  totalTokens:      number;
  estimatedCostUSD: number;
  callCount:        number;
  byOperation:      Record<string, { tokens: number; calls: number }>;
}

export async function getUserUsageSummary(
  userId: string,
  daysBack = 30
): Promise<UsageSummary> {
  const db     = createAdminClient();
  const cutoff = new Date(Date.now() - daysBack * 86_400_000).toISOString();

  const { data } = await db
    .from("ai_usage_logs")
    .select("operation, total_tokens, estimated_cost_usd")
    .eq("user_id", userId)
    .gte("created_at", cutoff);

  const rows = data ?? [];
  const byOperation: UsageSummary["byOperation"] = {};

  for (const row of rows) {
    const op = row.operation;
    if (!byOperation[op]) byOperation[op] = { tokens: 0, calls: 0 };
    byOperation[op].tokens += row.total_tokens;
    byOperation[op].calls  += 1;
  }

  return {
    totalTokens:      rows.reduce((s, r) => s + r.total_tokens, 0),
    estimatedCostUSD: rows.reduce((s, r) => s + Number(r.estimated_cost_usd), 0),
    callCount:        rows.length,
    byOperation,
  };
}
