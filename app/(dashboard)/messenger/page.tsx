/**
 * /messenger — Página de Facebook Messenger.
 *
 * Columnas reales de facebook_pages:
 *   id, page_id, page_name, is_active, connected_at, updated_at
 *
 * NO se usan: connection_state, last_error, last_synced_at, page_avatar_url
 */

import { redirect }              from "next/navigation";
import { createClient }          from "@/lib/supabase/server";
import { createAdminClient }     from "@/lib/supabase/admin";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { planHasFeature }        from "@/lib/billing/plans";
import { mapDbConversation }     from "@/lib/conversations-mapper";
import { MessengerShell }        from "@/components/messenger/messenger-shell";
import type { FBPageSummary }    from "@/lib/actions/messenger";

export const metadata = {
  title: "Messenger — FlowAI CRM",
};

export const dynamic = "force-dynamic";

export default async function MessengerPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspaceId = await getUserPrimaryWorkspace(user.id);
  const db          = createAdminClient();

  // ── Feature gate (comparte "instagram_dm" — mismo tier Pro+) ─────────────
  let allowed = false;
  if (workspaceId) {
    const { data: ws } = await db
      .from("workspaces")
      .select("plan_id")
      .eq("id", workspaceId)
      .single();
    allowed = ws ? planHasFeature(ws.plan_id, "instagram_dm") : false;
  }

  // ── Páginas Facebook — solo columnas reales ───────────────────────────────
  const pages: FBPageSummary[] =
    allowed && workspaceId
      ? await db
          .from("facebook_pages")
          .select("id, page_id, page_name, is_active, connected_at, updated_at")
          .eq("workspace_id", workspaceId)
          .eq("is_active", true)
          .order("connected_at", { ascending: false })
          .then((r) =>
            (r.data ?? []).map((row) => ({
              id:           row.id,
              page_id:      row.page_id,
              page_name:    row.page_name,
              is_active:    row.is_active,
              connected_at: row.connected_at,
              updated_at:   row.updated_at,
            } satisfies FBPageSummary))
          )
      : [];

  // ── Conversaciones iniciales filtradas a messenger ────────────────────────
  const { data: rows } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", user.id)
    .eq("channel", "messenger")
    .order("updated_at", { ascending: false });

  const conversations = (rows ?? []).map(mapDbConversation);

  return (
    <MessengerShell
      pages={pages}
      allowed={allowed}
      initialConversations={conversations}
      userId={user.id}
    />
  );
}
