// POST /api/ai/knowledge
// Smart canned response retrieval and FAQ generation.
// action: "find" | "faq"

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findRelevantResponse, generateFAQ } from "@/lib/ai/knowledge";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { isWithinQuota, incrementUsage } from "@/lib/billing/usage";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    action:          "find" | "faq";
    query?:          string;
    conversationId?: string;
    contactContext?: string;
    maxItems?:       number;
    workspaceId?:    string;
  };

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

  if (body.action === "faq") {
    const faqs = await generateFAQ({ userId: user.id, maxItems: body.maxItems });
    if (workspaceId) void incrementUsage(workspaceId, "ai_credits_used");
    return NextResponse.json({ faqs });
  }

  if (body.action === "find") {
    const { query, conversationId, contactContext } = body;
    if (!query || !conversationId) {
      return NextResponse.json({ error: "Missing query or conversationId" }, { status: 400 });
    }

    const result = await findRelevantResponse({
      query,
      userId:         user.id,
      conversationId,
      contactContext,
    });

    if (workspaceId) void incrementUsage(workspaceId, "ai_credits_used");
    return NextResponse.json({ result });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
