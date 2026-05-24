// POST /api/ai/copilot/rephrase
// Rephrases a message in the requested tone.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rephraseReply, type Tone } from "@/lib/ai/copilot";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { isWithinQuota, incrementUsage } from "@/lib/billing/usage";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    text:           string;
    tone:           Tone;
    conversationId: string;
    workspaceId?:   string;
  };

  const { text, tone, conversationId } = body;
  if (!text || !tone || !conversationId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // ── Quota check ───────────────────────────────────────────────────────────
  const workspaceId = body.workspaceId ?? await getUserPrimaryWorkspace(user.id);
  if (workspaceId) {
    const withinQuota = await isWithinQuota(workspaceId, "ai_credits");
    if (!withinQuota) {
      return NextResponse.json(
        { error: "Límite de créditos IA alcanzado. Actualiza tu plan.", code: "QUOTA_EXCEEDED" },
        { status: 429 }
      );
    }
  }

  const result = await rephraseReply({
    text,
    targetTone:     tone,
    userId:         user.id,
    conversationId,
  });

  if (!result) {
    return NextResponse.json({ error: "Rephrase failed" }, { status: 500 });
  }

  if (workspaceId) void incrementUsage(workspaceId, "ai_credits_used");

  return NextResponse.json(result);
}
