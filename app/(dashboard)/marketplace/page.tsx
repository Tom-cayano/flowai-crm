import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { listTemplates, getInstalledTemplates } from "@/lib/templates/marketplace";
import { MarketplaceClient } from "./marketplace-client";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspaceId = await getUserPrimaryWorkspace(user.id);
  if (!workspaceId) redirect("/onboarding");

  const [templates, installedIds] = await Promise.all([
    listTemplates({ limit: 50 }),
    getInstalledTemplates(workspaceId),
  ]);

  return (
    <MarketplaceClient
      workspaceId={workspaceId}
      templates={templates}
      installedIds={installedIds}
    />
  );
}
