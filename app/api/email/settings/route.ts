// Configuración del canal email + gestor de plantillas.
// GET  — settings + plantillas (siembra las 9 iniciales si no existen) + logs recientes
// PUT  — actualizar settings (API key Resend, remitente, webhook secret, enabled)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SEED_TEMPLATES } from "@/lib/email/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();

  // Sembrar plantillas iniciales si el usuario aún no tiene ninguna
  const { count } = await db
    .from("email_templates")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((count ?? 0) === 0) {
    await db.from("email_templates").insert(
      SEED_TEMPLATES.map((t) => ({ ...t, user_id: user.id }))
    );
  }

  const [{ data: settings }, { data: templates }, { data: logs }] = await Promise.all([
    db.from("email_settings").select("*").eq("user_id", user.id).maybeSingle(),
    db.from("email_templates").select("id, slug, name, subject, body_html").eq("user_id", user.id).order("slug"),
    db.from("email_logs")
      .select("id, to_email, subject, status, template_slug, opened_at, clicked_at, error, created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
  ]);

  return NextResponse.json({
    settings: settings
      ? { ...settings, resend_api_key: settings.resend_api_key ? "•••" + settings.resend_api_key.slice(-4) : null }
      : null,
    templates: templates ?? [],
    logs: logs ?? [],
  });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    resend_api_key?: string; from_email?: string; from_name?: string;
    reply_to?: string; webhook_secret?: string; enabled?: boolean;
  } | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const db = createAdminClient();
  const patch: Record<string, unknown> = {};
  // La API key solo se sobrescribe si envían una nueva (no el valor enmascarado)
  if (body.resend_api_key && !body.resend_api_key.startsWith("•")) patch.resend_api_key = body.resend_api_key.trim();
  if (body.from_email  !== undefined) patch.from_email  = body.from_email?.trim() || null;
  if (body.from_name   !== undefined) patch.from_name   = body.from_name?.trim() || null;
  if (body.reply_to    !== undefined) patch.reply_to    = body.reply_to?.trim() || null;
  if (body.webhook_secret !== undefined) patch.webhook_secret = body.webhook_secret?.trim() || null;
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;

  const { error } = await db
    .from("email_settings")
    .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
