// PUT /api/email/templates — actualizar una plantilla (por id)
// POST /api/email/templates — enviar email de prueba con una plantilla

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    { id?: string; subject?: string; body_html?: string; name?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "id requerido" }, { status: 422 });

  const db = createAdminClient();
  const { error } = await db
    .from("email_templates")
    .update({
      ...(body.subject   !== undefined ? { subject: body.subject } : {}),
      ...(body.body_html !== undefined ? { body_html: body.body_html } : {}),
      ...(body.name      !== undefined ? { name: body.name } : {}),
    })
    .eq("id", body.id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { slug?: string; to?: string } | null;
  if (!body?.slug || !body?.to) return NextResponse.json({ error: "slug y to requeridos" }, { status: 422 });

  const db = createAdminClient();
  const { data: tpl } = await db
    .from("email_templates")
    .select("subject, body_html")
    .eq("user_id", user.id)
    .eq("slug", body.slug)
    .maybeSingle();
  if (!tpl) return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });

  const { queueEmail } = await import("@/lib/email/send");
  const logId = await queueEmail({
    userId:   user.id,
    to:       body.to,
    subject:  `[PRUEBA] ${tpl.subject}`,
    bodyHtml: tpl.body_html,
    vars: {
      nombre: "Prueba", objetivo: "ganar masa muscular", tipo_cita: "valoración gratuita",
      fecha: "jueves 10 de julio a las 18:00", detalle: "Este es un envío de prueba.",
      negocio: "Love Fitness Murcia",
    },
    templateSlug: body.slug,
    origin: "test",
  });

  if (!logId) {
    return NextResponse.json(
      { error: "Canal email no configurado — guarda tu API key de Resend y actívalo" },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true, logId });
}
