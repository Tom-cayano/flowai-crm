// POST /api/ai/search
// Semantic hybrid search over conversations, contacts, and messages.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { semanticSearch } from "@/lib/ai/semantic-search";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { isWithinQuota, incrementUsage } from "@/lib/billing/usage";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    query:       string;
    maxResults?: number;
    types?:      Array<"conversation" | "contact" | "message">;
    workspaceId?: string;
  };

  const { query, maxResults = 10, types } = body;
  if (!query?.trim()) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
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

  const results = await semanticSearch({
    userId: user.id,
    query:  query.trim(),
    maxResults,
    types,
  });

  if (workspaceId) void incrementUsage(workspaceId, "ai_credits_used");

  return NextResponse.json({ results });
}
