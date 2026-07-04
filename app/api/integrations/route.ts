// Integraciones — management API
//
// GET  /api/integrations — list the user's connected applications (with stats)
// POST /api/integrations — connect a new application (generates Bearer token)

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { generateIntegrationToken, toSourceKey } from "@/lib/integrations/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("webhook_integrations")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ integrations: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { name?: string; hmacEnabled?: boolean; defaultTags?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 422 });

  const defaultTags = Array.isArray(body.defaultTags)
    ? body.defaultTags.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    : [];

  const token      = generateIntegrationToken();
  const hmacSecret = body.hmacEnabled ? randomBytes(24).toString("hex") : null;
  let sourceKey    = toSourceKey(name);

  // Retry once with a random suffix if the slug collides for this user
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase
      .from("webhook_integrations")
      .insert({
        user_id:      user.id,
        name,
        source_key:   sourceKey,
        token,
        hmac_secret:  hmacSecret,
        default_tags: defaultTags,
      })
      .select("*")
      .single();

    if (!error && data) return NextResponse.json({ integration: data }, { status: 201 });

    if (error?.code === "23505" && attempt === 0) {
      sourceKey = `${sourceKey}-${randomBytes(2).toString("hex")}`;
      continue;
    }
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ error: "Insert failed" }, { status: 500 });
}
