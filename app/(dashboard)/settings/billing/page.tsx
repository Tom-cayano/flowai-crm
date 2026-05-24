import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { getWorkspaceSubscription } from "@/lib/billing/subscriptions";
import { PLANS } from "@/lib/billing/plans";
import { BillingPageClient } from "./billing-client";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspaceId = await getUserPrimaryWorkspace(user.id);
  if (!workspaceId) redirect("/onboarding");

  const subscription = await getWorkspaceSubscription(workspaceId);

  return (
    <BillingPageClient
      workspaceId={workspaceId}
      subscription={subscription}
      plans={Object.values(PLANS)}
    />
  );
}
