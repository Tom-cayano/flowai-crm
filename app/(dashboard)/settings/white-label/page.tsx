import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/rbac/permissions";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { getPlan, planHasFeature } from "@/lib/billing/plans";
import { WhiteLabelClient } from "./white-label-client";
import type { Workspace } from "@/types/workspace";

export const dynamic = "force-dynamic";

export default async function WhiteLabelPage() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── Resolve workspace ─────────────────────────────────────────────────────
  const workspaceId = await getUserPrimaryWorkspace(user.id);
  if (!workspaceId) redirect("/onboarding");

  // ── Check plan: white_label feature required ──────────────────────────────
  const db = createAdminClient();
  const { data: ws } = await db
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .single();

  if (!ws) redirect("/dashboard");

  const plan    = getPlan(ws.plan_id);
  const allowed = planHasFeature(ws.plan_id, "white_label");

  const workspace: Workspace = {
    id:                   ws.id,
    ownerId:              ws.owner_id,
    parentId:             ws.parent_id,
    name:                 ws.name,
    slug:                 ws.slug,
    planId:               ws.plan_id,
    isAgency:             ws.is_agency,
    stripeCustomerId:     ws.stripe_customer_id,
    stripeSubscriptionId: ws.stripe_subscription_id,
    subscriptionStatus:   ws.subscription_status,
    trialEndsAt:          ws.trial_ends_at,
    currentPeriodEnd:     ws.current_period_end,
    billingInterval:      ws.billing_interval,
    logoUrl:              ws.logo_url,
    primaryColor:         ws.primary_color,
    companyName:          ws.company_name,
    customDomain:         ws.custom_domain,
    supportEmail:         ws.support_email,
    timezone:             ws.timezone,
    locale:               ws.locale,
    isActive:             ws.is_active,
    createdAt:            ws.created_at,
    updatedAt:            ws.updated_at,
  };

  return (
    <WhiteLabelClient
      workspace={workspace}
      plan={plan}
      allowed={allowed}
    />
  );
}
