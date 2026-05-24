import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { SessionUser, WorkspaceBranding, WorkspaceBillingStatus } from "@/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const sessionUser: SessionUser = {
    id: user.id,
    email: user.email ?? "",
    name:
      (user.user_metadata?.full_name as string | undefined) ??
      user.email?.split("@")[0] ??
      "User",
    role: (user.user_metadata?.role as SessionUser["role"]) ?? "agent",
    status: "online",
  };

  // ── Resolve workspace branding + billing status ───────────────────────────
  // Best-effort: if the user has no workspace yet the shell still renders;
  // individual pages handle their own /onboarding redirect when needed.
  let workspace: WorkspaceBranding | null = null;
  let billing:   WorkspaceBillingStatus  | null = null;
  const workspaceId = await getUserPrimaryWorkspace(user.id);

  if (workspaceId) {
    const db = createAdminClient();
    const { data } = await db
      .from("workspaces")
      .select("id, name, logo_url, primary_color, company_name, plan_id, subscription_status, trial_ends_at, grace_period_ends_at, stripe_customer_id")
      .eq("id", workspaceId)
      .single();

    if (data) {
      workspace = {
        id:           data.id,
        name:         data.name,
        logoUrl:      data.logo_url,
        primaryColor: data.primary_color ?? "#10b981",
        companyName:  data.company_name,
      };
      billing = {
        planId:            data.plan_id,
        status:            data.subscription_status,
        trialEndsAt:       data.trial_ends_at,
        gracePeriodEndsAt: data.grace_period_ends_at,
        stripeCustomerId:  data.stripe_customer_id,
      };
    }
  }

  return (
    <DashboardShell user={sessionUser} workspace={workspace} billing={billing}>
      {children}
    </DashboardShell>
  );
}
