import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { planHasFeature } from "@/lib/billing/plans";
import { InstagramSettingsClient } from "./instagram-settings-client";
import type { IGAccount } from "@/components/instagram/account-card";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ connected?: string; error?: string }>;
}

export default async function InstagramSettingsPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspaceId = await getUserPrimaryWorkspace(user.id);
  if (!workspaceId) redirect("/onboarding");

  const db = createAdminClient();

  const { data: ws } = await db
    .from("workspaces")
    .select("plan_id")
    .eq("id", workspaceId)
    .single();

  const allowed = ws ? planHasFeature(ws.plan_id, "instagram_dm") : false;

  const { data: accountRows } = allowed
    ? await db
        .from("instagram_accounts")
        .select("id, ig_user_id, ig_username, avatar_url, followers_count, connection_state, page_id, page_name, last_error, last_synced_at, token_expires_at")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
    : { data: [] };

  const accounts: IGAccount[] = (accountRows ?? []) as IGAccount[];

  const params     = await searchParams;
  const connected  = params.connected ? Number(params.connected) : undefined;
  const errorCode  = params.error;

  return (
    <InstagramSettingsClient
      initialAccounts={accounts}
      allowed={allowed}
      successCount={connected}
      errorCode={errorCode}
    />
  );
}
