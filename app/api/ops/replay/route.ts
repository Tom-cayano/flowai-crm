import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { replayJob } from "@/lib/observability/dlq";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const failureId: string | undefined = body?.failureId;
  if (!failureId) return NextResponse.json({ error: "failureId required" }, { status: 400 });

  const result = await replayJob(failureId, user.id);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({ jobId: result.newJobId });
}
