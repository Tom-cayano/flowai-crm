// POST /api/ai/auto-reply/drafts/[id]/reject
// Body: { note?: string }
// Agent rejects a pending draft → records feedback, checks for auto-escalation.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDraftById, rejectDraft, recordFeedback, countRecentRejections } from "@/lib/ai/draft-manager";
import { recordReplyEvent } from "@/lib/ai/reply-metrics";
import { executeHandoff } from "@/lib/ai/handoff";
import { pauseAIForConversation } from "@/lib/ai/auto-reply-engine";

export const dynamic = "force-dynamic";

const AUTO_ESCALATE_AFTER = 3; // consecutive rejections before auto-handoff

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Load draft — validate ownership
  const draft = await getDraftById(id);
  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  if (draft.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (draft.status !== "pending") {
    return NextResponse.json(
      { error: `Draft is already ${draft.status}` },
      { status: 409 }
    );
  }

  // Parse optional rejection note
  let note: string | undefined;
  try {
    const body = await req.json() as Record<string, unknown>;
    note = typeof body.note === "string" ? body.note : undefined;
  } catch { /* note is optional */ }

  // Reject
  await rejectDraft(id, note);
  void recordFeedback({ draftId: id, userId: user.id, rating: "thumbs_down" });
  void recordReplyEvent({
    userId:         user.id,
    conversationId: draft.conversationId,
    event:          "draft_rejected",
    confidence:     draft.confidence,
    intent:         draft.intent,
  });

  // Auto-escalation: if too many consecutive rejections → handoff + pause AI
  const rejections = await countRecentRejections(user.id, draft.conversationId, AUTO_ESCALATE_AFTER);
  let escalated = false;

  if (rejections >= AUTO_ESCALATE_AFTER) {
    await executeHandoff({
      userId:            user.id,
      conversationId:    draft.conversationId,
      reason:            "repeated_failure",
      confidence:        0,
      triggeredMessage:  "Auto-escalation: too many AI drafts rejected",
    });
    await pauseAIForConversation(draft.conversationId, 86_400);
    void recordReplyEvent({
      userId:         user.id,
      conversationId: draft.conversationId,
      event:          "handoff_triggered",
      intent:         "repeated_failure",
    });
    escalated = true;
  }

  return NextResponse.json({ success: true, escalated });
}
