// POST /api/ai/auto-reply/drafts/[id]/approve
// Agent approves a pending draft → sends via the appropriate outbound queue.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDraftById, approveDraft, recordFeedback } from "@/lib/ai/draft-manager";
import { recordReplyEvent } from "@/lib/ai/reply-metrics";
import { enqueueOutbound } from "@/lib/queue/producers";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
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
  if (new Date(draft.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Draft has expired" }, { status: 410 });
  }

  // Resolve conversation to get channel + instance info
  const db = createAdminClient();
  const { data: conv } = await (db as any)
    .from("conversations")
    .select("channel, contact_phone, whatsapp_instance_id")
    .eq("id", draft.conversationId)
    .maybeSingle();

  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const channel = conv.channel as string;

  // Resolve instance credentials
  const { data: instance } = conv.whatsapp_instance_id
    ? await db
        .from("whatsapp_instances")
        .select("instance_name, server_url, api_key")
        .eq("id", conv.whatsapp_instance_id)
        .maybeSingle()
    : { data: null };

  // Mark draft approved first (idempotency)
  const ok = await approveDraft(id, user.id);
  if (!ok) {
    return NextResponse.json(
      { error: "Failed to approve draft — it may have been claimed already" },
      { status: 409 }
    );
  }

  // Enqueue the outbound message
  if (channel === "whatsapp" && instance && conv.contact_phone) {
    await enqueueOutbound({
      instanceName:   instance.instance_name,
      serverUrl:      instance.server_url,
      apiKey:         instance.api_key,
      phone:          conv.contact_phone,
      content:        draft.content,
      type:           "text",
      conversationId: draft.conversationId,
      userId:         user.id,
      origin:         "ai_reply",
      agentName:      "FlowAI (approved)",
    });
  }
  // Instagram / Messenger approval routing can be added here (Phase 3+)

  // Record feedback + metrics
  void recordFeedback({ draftId: id, userId: user.id, rating: "thumbs_up" });
  void recordReplyEvent({
    userId:          user.id,
    conversationId:  draft.conversationId,
    event:           "draft_approved",
    channel,
    confidence:      draft.confidence,
    intent:          draft.intent,
  });

  return NextResponse.json({ success: true });
}
