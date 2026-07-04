// Integraciones — single integration management
//
// GET    /api/integrations/:id — status detail (integration + recent activity)
// PATCH  /api/integrations/:id — update name / enabled / tags / HMAC
// DELETE /api/integrations/:id — disconnect the application

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: integration, error } = await supabase
    .from("webhook_integrations")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!integration) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Recent activity + 24 h health summary
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ data: recentEvents }, { count: events24h }, { count: errors24h }] = await Promise.all([
    supabase
      .from("integration_events")
      .select("id, source, event, status, error, contact_id, contact_created, automations_triggered, processing_ms, created_at")
      .eq("integration_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("integration_events")
      .select("id", { count: "exact", head: true })
      .eq("integration_id", id)
      .gte("created_at", dayAgo),
    supabase
      .from("integration_events")
      .select("id", { count: "exact", head: true })
      .eq("integration_id", id)
      .in("status", ["failed", "dead"])
      .gte("created_at", dayAgo),
  ]);

  return NextResponse.json({
    integration,
    recent_events: recentEvents ?? [],
    stats_24h: { events: events24h ?? 0, errors: errors24h ?? 0 },
  });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    name?:        string;
    enabled?:     boolean;
    defaultTags?: string[];
    hmac?:        "enable" | "disable";
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: {
    name?:         string;
    enabled?:      boolean;
    default_tags?: string[];
    hmac_secret?:  string | null;
  } = {};
  if (typeof body.name === "string" && body.name.trim()) update.name = body.name.trim();
  if (typeof body.enabled === "boolean") update.enabled = body.enabled;
  if (Array.isArray(body.defaultTags)) {
    update.default_tags = body.defaultTags.filter(
      (t): t is string => typeof t === "string" && t.trim().length > 0
    );
  }
  if (body.hmac === "enable")  update.hmac_secret = randomBytes(24).toString("hex");
  if (body.hmac === "disable") update.hmac_secret = null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 422 });
  }

  const { data, error } = await supabase
    .from("webhook_integrations")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ integration: data });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("webhook_integrations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
