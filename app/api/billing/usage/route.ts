// GET /api/billing/usage?workspaceId=...
// Returns current period usage and plan limits.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUsageStatus } from "@/lib/billing/subscriptions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 });

  const status = await getUsageStatus(workspaceId);
  if (!status) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  return NextResponse.json(status);
}
