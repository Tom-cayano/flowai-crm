// POST /api/ai/workflow/generate
// Converts a natural language description into a WorkflowGraph JSON.
// Requires the advanced_automations feature (Pro+).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateWorkflow } from "@/lib/ai/workflow-generator";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { assertFeature, BillingError, billingErrorToResponse } from "@/lib/billing/guards";
import { isWithinQuota, incrementUsage } from "@/lib/billing/usage";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    description:  string;
    examples?:    string;
    workspaceId?: string;
  };

  const { description, examples } = body;
  if (!description?.trim()) {
    return NextResponse.json({ error: "Missing description" }, { status: 400 });
  }

  const workspaceId = body.workspaceId ?? await getUserPrimaryWorkspace(user.id);

  // ── Feature + quota check ──────────────────────────────────────────────────
  if (workspaceId) {
    try {
      await assertFeature(workspaceId, "advanced_automations");
    } catch (err) {
      if (err instanceof BillingError) {
        const { status, body: b } = billingErrorToResponse(err);
        return NextResponse.json(b, { status });
      }
      throw err;
    }

    const withinQuota = await isWithinQuota(workspaceId, "ai_credits");
    if (!withinQuota) {
      return NextResponse.json(
        { error: "Límite de créditos IA alcanzado. Actualiza tu plan.", code: "QUOTA_EXCEEDED" },
        { status: 429 }
      );
    }
  }

  const result = await generateWorkflow({
    description: description.trim(),
    userId:      user.id,
    examples,
  });

  if (!result) {
    return NextResponse.json({ error: "Workflow generation failed" }, { status: 500 });
  }

  // Workflow generation is expensive — count as 3 credits
  if (workspaceId) void incrementUsage(workspaceId, "ai_credits_used", 3);

  return NextResponse.json(result);
}
