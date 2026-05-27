// Usage tracking helpers — increment counters and check quotas.
// Call these from queue processors and API routes, never block on them.

import { createAdminClient } from "@/lib/supabase/admin";

type UsageField = "messages_sent" | "ai_credits_used" | "automations_executed" | "active_seats";

// Increment a usage counter for the current billing period
export async function incrementUsage(
  workspaceId: string,
  field:       UsageField,
  amount       = 1
): Promise<void> {
  try {
    const db = createAdminClient();
    await db.rpc("increment_usage", {
      p_workspace_id: workspaceId,
      p_field:        field,
      p_amount:       amount,
    });
  } catch {
    // Usage tracking must never block the main flow
  }
}

// Sync active seat count (call after member add/remove)
export async function syncSeatCount(workspaceId: string): Promise<void> {
  try {
    const db = createAdminClient();
    const { count } = await db
      .from("workspace_members")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("is_active", true);

    const db2 = createAdminClient();
    await db2.rpc("increment_usage", {
      p_workspace_id: workspaceId,
      p_field:        "active_seats",
      p_amount:       0, // upsert row, then set
    });

    // Set absolute value (not increment) — update directly
    const periodStart = new Date();
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);

    await db
      .from("usage_records")
      .update({ active_seats: count ?? 0, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
      .gte("period_start", periodStart.toISOString());
  } catch {
    // Non-critical
  }
}

// Check if a workspace is within quota (returns true = OK to proceed)
export async function isWithinQuota(
  workspaceId: string,
  resource:    "messages" | "ai_credits" | "automations"
): Promise<boolean> {
  try {
    const db          = createAdminClient();
    const periodStart = new Date();
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);

    const [{ data: workspace }, { data: usage }] = await Promise.all([
      db.from("workspaces").select("plan_id").eq("id", workspaceId).single(),
      db.from("usage_records")
        .select("messages_sent, ai_credits_used, automations_executed")
        .eq("workspace_id", workspaceId)
        .gte("period_start", periodStart.toISOString())
        .single(),
    ]);

    if (!workspace) return true;

    const { getPlan } = await import("./plans");
    const plan = getPlan(workspace.plan_id);

    const fieldMap: Record<string, { used: number; limit: number }> = {
      messages:    { used: usage?.messages_sent ?? 0,        limit: plan.maxMessagesMonthly },
      ai_credits:  { used: usage?.ai_credits_used ?? 0,      limit: plan.maxAiCredits },
      automations: { used: usage?.automations_executed ?? 0, limit: plan.maxAutomations },
    };

    const entry = fieldMap[resource];
    return entry ? entry.used < entry.limit : true;
  } catch {
    return true; // Fail open — never block on quota check failure
  }
}
