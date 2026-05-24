import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: conversationId } = await params;
  const body = await request.json().catch(() => ({}));
  const userId = (body as Record<string, unknown>).userId as string | undefined;

  // Broadcast typing event to all subscribers on this conversation channel
  await supabase.channel(`typing:${conversationId}`).send({
    type: "broadcast",
    event: "typing",
    payload: { userId: userId ?? user.id, conversationId },
  });

  return NextResponse.json({ ok: true });
}
