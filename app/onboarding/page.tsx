// /onboarding — workspace creation wizard for new users.
//
// Reached when an authenticated user has no workspace yet.
// Three pages currently redirect here: settings/billing, settings/team,
// settings/white-label. Sitting outside (dashboard) so there is no
// sidebar — the user hasn't completed setup yet.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Configurar workspace — FlowAI CRM",
};

export default async function OnboardingPage() {
  // ── Auth check ────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // ── Already has a workspace → go straight to dashboard ───────────────────
  const workspaceId = await getUserPrimaryWorkspace(user.id);
  if (workspaceId) redirect("/dashboard");

  return <SetupForm />;
}
