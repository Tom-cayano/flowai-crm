import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { getWorkspaceMembers } from "@/lib/workspace/workspace";
import { createAdminClient } from "@/lib/supabase/admin";
import { TeamPageClient } from "./team-client";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspaceId = await getUserPrimaryWorkspace(user.id);
  if (!workspaceId) redirect("/onboarding");

  const db = createAdminClient();
  const [members, { data: invitations }] = await Promise.all([
    getWorkspaceMembers(workspaceId),
    db
      .from("workspace_invitations")
      .select("*")
      .eq("workspace_id", workspaceId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  return (
    <TeamPageClient
      workspaceId={workspaceId}
      currentUserId={user.id}
      members={members}
      invitations={(invitations ?? []).map((i) => ({
        id:          i.id,
        workspaceId: i.workspace_id,
        email:       i.email,
        role:        i.role as "owner" | "admin" | "manager" | "agent",
        token:       i.token,
        invitedBy:   i.invited_by,
        acceptedAt:  i.accepted_at,
        expiresAt:   i.expires_at,
        createdAt:   i.created_at,
      }))}
    />
  );
}
