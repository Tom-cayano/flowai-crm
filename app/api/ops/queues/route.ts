import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAllQueueSnapshots } from "@/lib/observability/metrics";
import { getFailures } from "@/lib/observability/dlq";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [snapshots, failures] = await Promise.all([
    getAllQueueSnapshots(),
    getFailures({ limit: 100 }),
  ]);

  return NextResponse.json({ snapshots, failures });
}
