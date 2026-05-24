// Customer success — workspace health scoring and churn prediction.
// Run periodically (e.g. nightly cron) to compute engagement signals.

import { createAdminClient } from "@/lib/supabase/admin";
import type { WorkspaceHealth } from "@/types/workspace";

export async function computeWorkspaceHealth(workspaceId: string): Promise<WorkspaceHealth> {
  const db   = createAdminClient();
  const now  = new Date();
  const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Last member activity
  const { data: members } = await db
    .from("workspace_members")
    .select("last_seen_at")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .order("last_seen_at", { ascending: false })
    .limit(1);

  const lastActiveAt  = members?.[0]?.last_seen_at ?? null;
  const daysSinceLast = lastActiveAt
    ? Math.floor((now.getTime() - new Date(lastActiveAt).getTime()) / 86_400_000)
    : 999;

  // Messages last 7 days — via conversations join
  const { data: convs } = await db
    .from("conversations")
    .select("id")
    .eq("user_id", workspaceId)
    .limit(50);

  const convIds        = (convs ?? []).map((c) => c.id);
  let messagesLast7    = 0;
  if (convIds.length > 0) {
    const { count } = await db
      .from("messages")
      .select("*", { count: "exact", head: true })
      .in("conversation_id", convIds)
      .gte("created_at", week.toISOString());
    messagesLast7 = count ?? 0;
  }

  // AI calls last 7 days
  const { count: aiCount } = await db
    .from("ai_usage_logs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", workspaceId)
    .gte("created_at", week.toISOString());
  const aiCallsLast7 = aiCount ?? 0;

  // ── Score computation ──
  // Login score (0–25): penalise for days since login
  const loginScore = Math.max(0, 25 - daysSinceLast * 2);

  // Message score (0–25): 25 for ≥50 messages/week, linear below
  const messageScore = Math.min(25, Math.round((messagesLast7 / 50) * 25));

  // AI score (0–25): 25 for ≥20 AI calls/week
  const aiScore = Math.min(25, Math.round((aiCallsLast7 / 20) * 25));

  // Automation score (0–25): presence of active automations
  const { count: autoCount } = await db
    .from("automations")
    .select("*", { count: "exact", head: true })
    .eq("user_id", workspaceId)
    .eq("status", "active");
  const automationScore = Math.min(25, (autoCount ?? 0) * 5);

  const healthScore = loginScore + messageScore + aiScore + automationScore;

  // Churn risk
  const churnRisk: WorkspaceHealth["churnRisk"] =
    healthScore >= 70 ? "low"
    : healthScore >= 45 ? "medium"
    : healthScore >= 20 ? "high"
    : "critical";

  // Onboarding activation score
  const { data: onboarding } = await db
    .from("onboarding_progress")
    .select("*")
    .eq("workspace_id", workspaceId)
    .single();

  let activationScore = 0;
  if (onboarding) {
    const steps = [
      onboarding.whatsapp_connected,
      onboarding.first_message_sent,
      onboarding.ai_configured,
      onboarding.team_member_invited,
      onboarding.automation_created,
      onboarding.billing_setup,
    ];
    activationScore = Math.round((steps.filter(Boolean).length / steps.length) * 100);
  }

  const health: WorkspaceHealth = {
    workspaceId,
    healthScore,
    loginScore,
    messageScore,
    aiScore,
    automationScore,
    churnRisk,
    activationScore,
    lastActiveAt,
    daysSinceLastLogin: daysSinceLast === 999 ? null : daysSinceLast,
    messagesLast7Days:  messagesLast7,
    aiCallsLast7Days:   aiCallsLast7,
    computedAt:         now.toISOString(),
  };

  // Persist
  await db.from("workspace_health").upsert({
    workspace_id:          workspaceId,
    health_score:          healthScore,
    login_score:           loginScore,
    message_score:         messageScore,
    ai_score:              aiScore,
    automation_score:      automationScore,
    churn_risk:            churnRisk,
    activation_score:      activationScore,
    last_active_at:        lastActiveAt,
    days_since_last_login: daysSinceLast === 999 ? null : daysSinceLast,
    messages_last_7_days:  messagesLast7,
    ai_calls_last_7_days:  aiCallsLast7,
    computed_at:           now.toISOString(),
  }, { onConflict: "workspace_id" });

  return health;
}

export async function getWorkspaceHealth(workspaceId: string): Promise<WorkspaceHealth | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("workspace_health")
    .select("*")
    .eq("workspace_id", workspaceId)
    .single();

  if (!data) return null;

  return {
    workspaceId:         data.workspace_id,
    healthScore:         data.health_score,
    loginScore:          data.login_score,
    messageScore:        data.message_score,
    aiScore:             data.ai_score,
    automationScore:     data.automation_score,
    churnRisk:           data.churn_risk as WorkspaceHealth["churnRisk"],
    activationScore:     data.activation_score,
    lastActiveAt:        data.last_active_at,
    daysSinceLastLogin:  data.days_since_last_login,
    messagesLast7Days:   data.messages_last_7_days,
    aiCallsLast7Days:    data.ai_calls_last_7_days,
    computedAt:          data.computed_at,
  };
}
