// GET  /api/onboarding?workspaceId=... — get progress
// POST /api/onboarding — complete a step or dismiss wizard

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getOnboardingProgress,
  completeOnboardingStep,
  dismissWizard,
  buildChecklist,
  getCompletionPct,
  type OnboardingStep,
} from "@/lib/onboarding/checklist";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 });

  const progress = await getOnboardingProgress(workspaceId);
  if (!progress) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const checklist   = buildChecklist(progress);
  const completionPct = getCompletionPct(progress);

  return NextResponse.json({ progress, checklist, completionPct });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    workspaceId: string;
    action:      "complete_step" | "dismiss";
    step?:       OnboardingStep;
  };

  const { workspaceId, action, step } = body;

  if (action === "complete_step" && step) {
    await completeOnboardingStep(workspaceId, step);
  } else if (action === "dismiss") {
    await dismissWizard(workspaceId);
  } else {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
