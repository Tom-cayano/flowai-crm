// POST /api/templates/[id]/install
// Installs a marketplace template into the user's workspace.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { installTemplate } from "@/lib/templates/marketplace";
import { completeOnboardingStep } from "@/lib/onboarding/checklist";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: templateId } = await params;
  const { workspaceId }    = await req.json() as { workspaceId: string };

  if (!workspaceId) return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 });

  const result = await installTemplate({ templateId, workspaceId, installedBy: user.id });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Mark onboarding step if it was a workflow
  if (result.automationId) {
    await completeOnboardingStep(workspaceId, "automation_created");
  }

  return NextResponse.json({ ...result, installed: true });
}
