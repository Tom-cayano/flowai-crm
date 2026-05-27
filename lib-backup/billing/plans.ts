// Plan definitions, feature gates, and quota enforcement.
// Source of truth for what each plan allows — mirrors DB seeds.

import type { Plan, PlanId, PlanFeature, UsageStatus, UsageRecord } from "@/types/billing";

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id:                   "starter",
    name:                 "Starter",
    description:          "Para equipos pequeños",
    priceMonthly:         2900,
    priceYearly:          29000,
    maxSeats:             1,
    maxMessagesMonthly:   1000,
    maxAiCredits:         500,
    maxAutomations:       10,
    maxWorkspaces:        1,
    features:             ["whatsapp", "ai_replies", "basic_automations", "inbox"],
    isActive:             true,
  },
  pro: {
    id:                   "pro",
    name:                 "Pro",
    description:          "Para equipos en crecimiento",
    priceMonthly:         7900,
    priceYearly:          79000,
    maxSeats:             5,
    maxMessagesMonthly:   5000,
    maxAiCredits:         2000,
    maxAutomations:       50,
    maxWorkspaces:        1,
    features:             [
      "whatsapp", "ai_replies", "advanced_automations", "inbox",
      "analytics", "bulk_messaging", "api_access", "instagram_dm",
    ],
    isActive:             true,
  },
  agency: {
    id:                   "agency",
    name:                 "Agency",
    description:          "Para agencias y equipos grandes",
    priceMonthly:         19900,
    priceYearly:          199000,
    maxSeats:             25,
    maxMessagesMonthly:   25000,
    maxAiCredits:         10000,
    maxAutomations:       500,
    maxWorkspaces:        10,
    features:             [
      "whatsapp", "ai_replies", "advanced_automations", "inbox",
      "analytics", "bulk_messaging", "api_access", "instagram_dm",
      "white_label", "sub_workspaces", "agency_dashboard",
    ],
    isActive:             true,
  },
  enterprise: {
    id:                   "enterprise",
    name:                 "Enterprise",
    description:          "Para grandes corporaciones",
    priceMonthly:         0,
    priceYearly:          0,
    maxSeats:             999,
    maxMessagesMonthly:   999_999,
    maxAiCredits:         999_999,
    maxAutomations:       9999,
    maxWorkspaces:        999,
    features:             [
      "whatsapp", "ai_replies", "advanced_automations", "inbox",
      "analytics", "bulk_messaging", "api_access", "instagram_dm", "white_label",
      "sub_workspaces", "agency_dashboard", "sso",
      "custom_integrations", "sla",
    ],
    isActive:             true,
  },
};

export function getPlan(planId: string): Plan {
  return PLANS[planId as PlanId] ?? PLANS.starter;
}

// Check if a plan includes a specific feature
export function planHasFeature(planId: string, feature: PlanFeature): boolean {
  // Development bypass — set PLAN_GATE_BYPASS=true in .env.local to unlock all
  // plan features during local development. Both conditions must hold; the
  // NODE_ENV guard means this branch is unreachable in a production build even
  // if the variable somehow leaks into the environment.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.PLAN_GATE_BYPASS === "true"
  ) {
    return true;
  }
  return getPlan(planId).features.includes(feature);
}

// Build a full usage status with limit percentages
export function buildUsageStatus(plan: Plan, usage: UsageRecord): UsageStatus {
  const pct = (used: number, limit: number) =>
    limit === 0 ? 0 : Math.round((used / limit) * 100);

  return {
    plan,
    usage,
    limits: {
      messages: {
        used:     usage.messagesSent,
        limit:    plan.maxMessagesMonthly,
        pct:      pct(usage.messagesSent, plan.maxMessagesMonthly),
        exceeded: usage.messagesSent >= plan.maxMessagesMonthly,
      },
      aiCredits: {
        used:     usage.aiCreditsUsed,
        limit:    plan.maxAiCredits,
        pct:      pct(usage.aiCreditsUsed, plan.maxAiCredits),
        exceeded: usage.aiCreditsUsed >= plan.maxAiCredits,
      },
      automations: {
        used:     usage.automationsExecuted,
        limit:    plan.maxAutomations,
        pct:      pct(usage.automationsExecuted, plan.maxAutomations),
        exceeded: usage.automationsExecuted >= plan.maxAutomations,
      },
      seats: {
        used:     usage.activeSeats,
        limit:    plan.maxSeats,
        pct:      pct(usage.activeSeats, plan.maxSeats),
        exceeded: usage.activeSeats >= plan.maxSeats,
      },
    },
  };
}

// Format plan price for display
export function formatPlanPrice(
  plan: Plan,
  interval: "monthly" | "yearly" = "monthly"
): string {
  const cents = interval === "yearly" ? plan.priceYearly : plan.priceMonthly;
  if (cents === 0) return "Custom";
  return `$${(cents / 100).toFixed(0)}`;
}
