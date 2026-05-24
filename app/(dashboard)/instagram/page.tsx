import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { planHasFeature } from "@/lib/billing/plans";
import { mapDbConversation } from "@/lib/conversations-mapper";
import { InstagramShell } from "@/components/instagram/instagram-shell";
import type { IGAccountSummary } from "@/lib/actions/instagram";

export const metadata = {
  title: "Instagram DM — FlowAI CRM",
};

export const dynamic = "force-dynamic";

export default async function InstagramPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspaceId = await getUserPrimaryWorkspace(user.id);
  const db = createAdminClient();

  // ── Feature gate ─────────────────────────────────────────────────────────
  let allowed = false;
  if (workspaceId) {
    const { data: ws } = await db
      .from("workspaces")
      .select("plan_id")
      .eq("id", workspaceId)
      .single();
    allowed = ws ? planHasFeature(ws.plan_id, "instagram_dm") : false;
  }

  // ── Connected accounts ────────────────────────────────────────────────────
  const accounts: IGAccountSummary[] = allowed && workspaceId
    ? await db
        .from("instagram_accounts")
        .select("id, ig_user_id, ig_username, avatar_url, followers_count, connection_state, page_id, page_name, last_error, last_synced_at, token_expires_at")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .then((r) => (r.data ?? []) as IGAccountSummary[])
    : [];

  // ── Instagram conversations ───────────────────────────────────────────────
  const { data: rows } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", user.id)
    .eq("channel", "instagram")
    .order("updated_at", { ascending: false });

  const conversations = (rows ?? []).map(mapDbConversation);

  return (
    <InstagramShell
      accounts={accounts}
      allowed={allowed}
      initialConversations={conversations}
      userId={user.id}
    />
  );
}
