// Reactivación MANUAL del asistente comercial en una conversación.
//
// Único modo de volver a activar la IA tras la intervención de un humano
// (limpia ia_disabled y escalated_to_human). No hay reactivación automática:
// ni temporizadores, ni ventanas de 24h, ni detección de intención.
//
// POST /api/sales/reactivate?user=<uuid>   body: { phone } | { contactId }
// Seguridad: x-sales-secret == EVOLUTION_WEBHOOK_SECRET (para el botón del CRM
// llámalo desde el backend con el secreto). Ruta exenta del middleware.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reactivateSalesAssistant } from "@/lib/sales/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET ?? "";
  if (secret && req.headers.get("x-sales-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { phone?: string; contactId?: string } = {};
  try { body = (await req.json()) as typeof body; } catch { /* opcional */ }

  const userId = req.nextUrl.searchParams.get("user") ?? "";
  const db = createAdminClient();

  let contactId = body.contactId ?? "";
  if (!contactId) {
    const phone = (body.phone ?? "").replace(/\D/g, "");
    if (!phone || !userId) {
      return NextResponse.json({ ok: false, error: "phone (body) + user (query), o contactId" }, { status: 200 });
    }
    const { data: contact } = await db
      .from("contacts")
      .select("id")
      .eq("user_id", userId)
      .or(`phone.eq.${phone},whatsapp.eq.${phone}`)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!contact) return NextResponse.json({ ok: false, error: "contacto no encontrado" }, { status: 200 });
    contactId = contact.id;
  }

  await reactivateSalesAssistant(db, contactId);
  console.log("[sales-reactivate] IA reactivada", { contactId, userId });
  return NextResponse.json({ ok: true, reactivated: contactId });
}
