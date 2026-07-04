// GET /api/integrations/:id/logs — webhook activity log
//   ?limit=50            max rows (default 50, cap 200)
//   ?status=failed       filter by status
//   ?security=1          also include failed auth attempts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Ownership check (RLS also protects, this gives a clean 404)
  const { data: integration } = await supabase
    .from("webhook_integrations")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!integration) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sp    = req.nextUrl.searchParams;
  const limit = Math.min(Number(sp.get("limit") ?? 50) || 50, 200);

  const VALID_STATUSES = ["received", "processed", "failed", "retrying", "dead"] as const;
  type EventStatus = (typeof VALID_STATUSES)[number];
  const statusParam = sp.get("status");
  const status = VALID_STATUSES.includes(statusParam as EventStatus)
    ? (statusParam as EventStatus)
    : null;

  let query = supabase
    .from("integration_events")
    .select("id, source, event, payload, status, error, attempts, contact_id, contact_created, automations_triggered, processing_ms, created_at, processed_at")
    .eq("integration_id", id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);

  const { data: events, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let securityEvents = null;
  if (sp.get("security") === "1") {
    const { data } = await supabase
      .from("integration_security_events")
      .select("id, ip, reason, detail, created_at")
      .eq("integration_id", id)
      .order("created_at", { ascending: false })
      .limit(50);
    securityEvents = data ?? [];
  }

  return NextResponse.json({ events: events ?? [], security_events: securityEvents });
}
