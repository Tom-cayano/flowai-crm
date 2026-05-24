// POST /api/ai/copilot/analyze
// Runs conversation intelligence + sales intelligence in parallel.
// Results are cached in Redis — subsequent calls within 5 min are instant.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeConversation } from "@/lib/ai/conversation-intelligence";
import { getSalesIntelligence } from "@/lib/ai/sales-intelligence";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { isWithinQuota, incrementUsage } from "@/lib/billing/usage";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    conversationId: string;
    contactId?:     string | null;
    forceRefresh?:  boolean;
    workspaceId?:   string;
  };

  const { conversationId, contactId, forceRefresh = false } = body;
  if (!conversationId) {
    return NextResponse.json({ error: "Missing conversationId" }, { status: 400 });
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

  const [intelligence, salesIntel] = await Promise.all([
    analyzeConversation(conversationId, user.id, forceRefresh),
    getSalesIntelligence(conversationId, user.id, contactId, forceRefresh),
  ]);

  // Counts as 2 credits (runs two models in parallel)
  if (workspaceId) void incrementUsage(workspaceId, "ai_credits_used", 2);

  return NextResponse.json({ intelligence, salesIntel });
}
