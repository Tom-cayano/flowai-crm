// Subscription management — create, update, and query workspace subscriptions.
// All writes go through Stripe webhooks to keep state consistent.

import { createAdminClient } from "@/lib/supabase/admin";
import { getPlan } from "./plans";
import type { Plan, UsageRecord, UsageStatus } from "@/types/billing";
import { buildUsageStatus } from "./plans";
import type { Database } from "@/types/supabase";

type Json = Database["public"]["Tables"]["billing_events"]["Row"]["payload"];

// ─── Get workspace plan + subscription ───────────────────────

export interface WorkspaceSubscription {
  workspaceId:          string;
  planId:               string;
  plan:                 Plan;
  status:               string;
  trialEndsAt:          string | null;
  currentPeriodEnd:     string | null;
  stripeCustomerId:     string | null;
  stripeSubscriptionId: string | null;
  billingInterval:      string;
  gracePeriodEndsAt:    string | null;
}

export async function getWorkspaceSubscription(
  workspaceId: string
): Promise<WorkspaceSubscription | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("workspaces")
    .select("id, plan_id, subscription_status, trial_ends_at, current_period_end, stripe_customer_id, stripe_subscription_id, billing_interval, grace_period_ends_at")
    .eq("id", workspaceId)
    .single();

  if (!data) return null;

  return {
    workspaceId:          data.id,
    planId:               data.plan_id,
    plan:                 getPlan(data.plan_id),
    status:               data.subscription_status,
    trialEndsAt:          data.trial_ends_at,
    currentPeriodEnd:     data.current_period_end,
    stripeCustomerId:     data.stripe_customer_id,
    stripeSubscriptionId: data.stripe_subscription_id,
    billingInterval:      data.billing_interval,
    gracePeriodEndsAt:    data.grace_period_ends_at,
  };
}

// ─── Update subscription from Stripe webhook ──────────────────

export async function syncSubscriptionFromStripe(opts: {
  workspaceId:          string;
  planId?:              string;
  status?:              string;
  stripeCustomerId?:    string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?:    Date | null;
  trialEndsAt?:         Date | null;
  billingInterval?:     string;
}): Promise<void> {
  const db = createAdminClient();

  await db.from("workspaces").update({
    updated_at:             new Date().toISOString(),
    ...(opts.planId               && { plan_id:                opts.planId }),
    ...(opts.status               && { subscription_status:    opts.status }),
    ...(opts.stripeCustomerId     && { stripe_customer_id:     opts.stripeCustomerId }),
    ...(opts.stripeSubscriptionId && { stripe_subscription_id: opts.stripeSubscriptionId }),
    ...(opts.billingInterval      && { billing_interval:       opts.billingInterval }),
    ...(opts.currentPeriodEnd !== undefined && {
      current_period_end: opts.currentPeriodEnd?.toISOString() ?? null,
    }),
    ...(opts.trialEndsAt !== undefined && {
      trial_ends_at: opts.trialEndsAt?.toISOString() ?? null,
    }),
  }).eq("id", opts.workspaceId);
}

// ─── Get current period usage ─────────────────────────────────

export async function getWorkspaceUsage(workspaceId: string): Promise<UsageRecord> {
  const db          = createAdminClient();
  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);

  const { data } = await db
    .from("usage_records")
    .select("*")
    .eq("workspace_id", workspaceId)
    .gte("period_start", periodStart.toISOString())
    .single();

  if (!data) {
    return {
      workspaceId,
      periodStart:          periodStart.toISOString(),
      periodEnd:            "",
      messagesSent:         0,
      aiCreditsUsed:        0,
      automationsExecuted:  0,
      activeSeats:          0,
    };
  }

  return {
    workspaceId,
    periodStart:          data.period_start,
    periodEnd:            data.period_end,
    messagesSent:         data.messages_sent,
    aiCreditsUsed:        data.ai_credits_used,
    automationsExecuted:  data.automations_executed,
    activeSeats:          data.active_seats,
  };
}

// ─── Full usage status (plan + usage + limits) ────────────────

export async function getUsageStatus(workspaceId: string): Promise<UsageStatus | null> {
  const sub = await getWorkspaceSubscription(workspaceId);
  if (!sub) return null;

  const usage = await getWorkspaceUsage(workspaceId);
  return buildUsageStatus(sub.plan, usage);
}

// ─── Enforce quota before sensitive operations ─────────────────
// Returns error string if exceeded, null if OK.

export async function enforceQuota(
  workspaceId: string,
  resource: "messages" | "ai_credits" | "automations" | "seats"
): Promise<string | null> {
  const status = await getUsageStatus(workspaceId);
  if (!status) return null;

  const fieldMap = {
    messages:    "messages",
    ai_credits:  "aiCredits",
    automations: "automations",
    seats:       "seats",
  } as const;

  const limit = status.limits[fieldMap[resource]];
  if (limit.exceeded) {
    return `Límite de ${resource.replace("_", " ")} alcanzado en tu plan ${status.plan.name}. Actualiza para continuar.`;
  }

  return null;
}

// ─── Record billing event ──────────────────────────────────────

export async function recordBillingEvent(opts: {
  workspaceId:    string;
  eventType:      string;
  stripeEventId?: string | null;
  payload:        Record<string, unknown>;
}): Promise<void> {
  const db = createAdminClient();
  await db.from("billing_events").insert({
    workspace_id:    opts.workspaceId,
    event_type:      opts.eventType,
    stripe_event_id: opts.stripeEventId ?? null,
    payload:         opts.payload as unknown as Json,
  });
}
