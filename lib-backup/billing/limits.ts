// Hard limit helpers — seat counts, automation counts.
// Returns structured data (not throws) so callers can warn vs block.
// All checks fail-open on unexpected DB errors so billing never breaks the app.

import { createAdminClient } from "@/lib/supabase/admin";
import { getWorkspaceSubscription } from "./subscriptions";

export interface LimitCheck {
  ok:       boolean;
  current:  number;
  limit:    number;
  planName: string;
  planId:   string;
}

// ─── Seat limit ───────────────────────────────────────────────────────────────
// Counts active workspace_members against plan.maxSeats.
// Call BEFORE adding a new member or accepting an invitation.

export async function checkSeatLimit(workspaceId: string): Promise<LimitCheck> {
  try {
    const sub = await getWorkspaceSubscription(workspaceId);
    if (!sub) return ok999("starter");

    const db = createAdminClient();
    const { count } = await db
      .from("workspace_members")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("is_active", true);

    const current = count ?? 0;
    const limit   = sub.plan.maxSeats;

    return { ok: current < limit, current, limit, planName: sub.plan.name, planId: sub.planId };
  } catch {
    return ok999("starter"); // fail open
  }
}

// ─── Automation limit ─────────────────────────────────────────────────────────
// Counts non-archived automations owned by userId against plan.maxAutomations.
// The automations table is currently scoped to user_id (not workspace_id),
// so the plan comes from workspaceId but the count is per userId.

export async function checkAutomationLimit(
  workspaceId: string,
  userId: string
): Promise<LimitCheck> {
  try {
    const sub = await getWorkspaceSubscription(workspaceId);
    if (!sub) return ok999("starter");

    const db = createAdminClient();
    const { count } = await db
      .from("automations")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["active", "inactive", "draft"]);

    const current = count ?? 0;
    const limit   = sub.plan.maxAutomations;

    return { ok: current < limit, current, limit, planName: sub.plan.name, planId: sub.planId };
  } catch {
    return ok999("starter"); // fail open
  }
}

function ok999(planId: string): LimitCheck {
  return { ok: true, current: 0, limit: 999, planName: "Starter", planId };
}

// ─── Workspace (sub-workspace) limit ──────────────────────────────────────────
// For agency plan: max child workspaces per parent.

export async function checkWorkspaceLimit(
  parentWorkspaceId: string
): Promise<LimitCheck> {
  try {
    const sub = await getWorkspaceSubscription(parentWorkspaceId);
    if (!sub) return ok999("starter");

    const db = createAdminClient();
    const { count } = await db
      .from("workspaces")
      .select("*", { count: "exact", head: true })
      .eq("parent_id", parentWorkspaceId)
      .eq("is_active", true);

    const current = count ?? 0;
    const limit   = sub.plan.maxWorkspaces;

    return { ok: current < limit, current, limit, planName: sub.plan.name, planId: sub.planId };
  } catch {
    return ok999("starter");
  }
}
