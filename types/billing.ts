// SaaS billing types — plans, subscriptions, usage, feature gates.

export type PlanId = "starter" | "pro" | "agency" | "enterprise";
export type BillingInterval = "monthly" | "yearly";
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete";

export type PlanFeature =
  | "whatsapp"
  | "instagram_dm"
  | "ai_replies"
  | "basic_automations"
  | "advanced_automations"
  | "inbox"
  | "analytics"
  | "bulk_messaging"
  | "api_access"
  | "white_label"
  | "sub_workspaces"
  | "agency_dashboard"
  | "sso"
  | "custom_integrations"
  | "sla";

export interface Plan {
  id:                   PlanId;
  name:                 string;
  description:          string;
  priceMonthly:         number;   // cents
  priceYearly:          number;   // cents
  stripePriceMonthly?:  string;
  stripePriceYearly?:   string;
  maxSeats:             number;
  maxMessagesMonthly:   number;
  maxAiCredits:         number;
  maxAutomations:       number;
  maxWorkspaces:        number;
  features:             PlanFeature[];
  isActive:             boolean;
}

export interface UsageRecord {
  workspaceId:          string;
  periodStart:          string;
  periodEnd:            string;
  messagesSent:         number;
  aiCreditsUsed:        number;
  automationsExecuted:  number;
  activeSeats:          number;
}

export interface UsageStatus {
  plan:                 Plan;
  usage:                UsageRecord;
  limits: {
    messages:           { used: number; limit: number; pct: number; exceeded: boolean };
    aiCredits:          { used: number; limit: number; pct: number; exceeded: boolean };
    automations:        { used: number; limit: number; pct: number; exceeded: boolean };
    seats:              { used: number; limit: number; pct: number; exceeded: boolean };
  };
}

export interface CheckoutSession {
  url: string;
}

export interface BillingEvent {
  id:            string;
  workspaceId:   string;
  eventType:     string;
  stripeEventId: string | null;
  payload:       Record<string, unknown>;
  processedAt:   string;
}
