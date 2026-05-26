// GET /api/ai/auto-reply/drafts?conversationId=<uuid>
// Returns the active pending draft for a conversation (if any).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPendingDraft, getAllPendingDrafts, expireOldDrafts } from "@/lib/ai/draft-manager";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const conversationId = req.nextUrl.searchParams.get("conversationId");

  // Housekeeping: expire stale drafts on read (cheap, ~1 DB call)
  void expireOldDrafts(user.id);

  if (conversationId) {
    const draft = await getPendingDraft(conversationId);
    return NextResponse.json({ draft });
  }

  // Fetch all pending drafts for the user's workspace
  const drafts = await getAllPendingDrafts(user.id);
  return NextResponse.json({ drafts });
}
