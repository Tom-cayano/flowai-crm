// Puente del asistente comercial (ejecutado en Vercel — código actual).
//
// Motivo: el worker de Railway corre una imagen congelada (commit 4-8 jul) que
// no conoce la acción `sales_assistant`. Este endpoint permite que el motor de
// automatizaciones lo invoque mediante una acción `send_webhook` (que el worker
// congelado SÍ soporta): ejecuta runSalesAssistant con el código actual y
// encola la respuesta en `wpp-outbound`, que el worker congelado sí procesa y
// entrega vía Evolution. Cuando el worker se reconstruya con el código nuevo,
// basta volver a usar la acción nativa `sales_assistant`.
//
// Seguridad: exige la cabecera x-sales-secret == EVOLUTION_WEBHOOK_SECRET.
// Ruta bajo /api/sales/ → exenta del middleware de sesión (proxy.ts).

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSalesAssistant } from "@/lib/sales/assistant";
import { shouldStartSalesAssistant } from "@/lib/sales/gate";
import type { ExecutionContext } from "@/types/automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET ?? "";
  if (secret && req.headers.get("x-sales-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { phone?: string; text?: string } = {};
  try { body = (await req.json()) as typeof body; } catch { /* body opcional */ }

  const phone  = (body.phone ?? "").replace(/\D/g, "");
  const userId = req.nextUrl.searchParams.get("user") ?? "";
  if (!phone || !userId) {
    return NextResponse.json({ ok: false, error: "phone (body) y user (query) requeridos" }, { status: 200 });
  }

  const db = createAdminClient();

  // 1. Contacto por teléfono (dígitos normalizados) en el ámbito del usuario
  const { data: contact } = await db
    .from("contacts")
    .select("id, tags, custom_fields")
    .eq("user_id", userId)
    .or(`phone.eq.${phone},whatsapp.eq.${phone}`)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!contact) {
    return NextResponse.json({ ok: false, error: "contacto no encontrado" }, { status: 200 });
  }

  // 2. Conversación WhatsApp más reciente del contacto
  const { data: conv } = await db
    .from("conversations")
    .select("id, assigned_to, status")
    .eq("user_id", userId)
    .eq("contact_id", contact.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 3. Último mensaje ENTRANTE del contacto (sender=contact) con su antigüedad.
  //    El message.processor almacena el mensaje ANTES de disparar la
  //    automatización, así que ante un trigger real el entrante ya está en BD
  //    y es reciente. Lo usamos como referencia de frescura.
  let incomingText  = (body.text ?? "").trim();
  let lastInboundAt: string | null = null;
  let inboundExternalId: string | null = null;
  if (conv) {
    const { data: lastIn } = await db
      .from("messages")
      .select("content, created_at, external_id, id")
      .eq("conversation_id", conv.id)
      .eq("sender", "contact")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!incomingText) incomingText = (lastIn?.content ?? "").trim();
    lastInboundAt = lastIn?.created_at ?? null;
    // Clave idempotente: external_id (estable ante reintentos); si falta, el id de la fila.
    inboundExternalId = lastIn?.external_id ?? lastIn?.id ?? null;
  }

  // 3b. FILTRO CENTRAL ÚNICO — decide si el asistente puede intervenir y reserva
  //     la respuesta (idempotencia). Bloquea clientes, familiares, internos,
  //     proveedores, mensajes antiguos, conversaciones con humano, IA
  //     desactivada, reservas activas y mensajes ya respondidos. Toda la lógica
  //     vive en lib/sales/gate.ts (no hay guardas repartidas).
  const gate = await shouldStartSalesAssistant(db, {
    contactId:      contact.id,
    tags:           contact.tags,
    customFields:   contact.custom_fields as Record<string, unknown> | null,
    conversationId: conv?.id ?? null,
    incomingText,
    lastInboundAt,
    inboundExternalId,
  });
  if (!gate.start) {
    console.warn("[sales-trigger] BLOCK", { reason: gate.reason, detail: gate.detail, phone, userId });
    return NextResponse.json({ ok: false, blocked: gate.reason, detail: gate.detail ?? null }, { status: 200 });
  }
  console.log("[sales-trigger] GATE ok", { reason: gate.reason, phone, userId });

  // 4. Credenciales de la instancia WhatsApp abierta del usuario (per-instancia)
  const { data: inst } = await db
    .from("whatsapp_instances")
    .select("instance_name, server_url, api_key")
    .eq("user_id", userId)
    .eq("connection_state", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ctx: ExecutionContext = {
    executionId:    "",
    automationId:   "sales-bridge",
    userId,
    conversationId: conv?.id ?? null,
    contactId:      contact.id,
    phone,
    instanceName:   inst?.instance_name ?? process.env.EVOLUTION_INSTANCE_NAME ?? "",
    serverUrl:      inst?.server_url    ?? process.env.EVOLUTION_SERVER_URL    ?? "",
    instanceApiKey: inst?.api_key       ?? process.env.EVOLUTION_API_KEY       ?? "",
    incomingText,
    isFirstMessage: false,
    variables:      {},
    triggerType:    "message_received",
  };

  // 5. Ejecutar el asistente (encola la respuesta en wpp-outbound → worker → Evolution)
  console.log("[sales-trigger] FIRE", {
    phone, userId, conversationId: conv?.id ?? null, gate: gate.reason,
    textPreview: incomingText.slice(0, 60),
  });
  const result = await runSalesAssistant(ctx, async (level, message) => {
    console.log(`[sales-bridge] ${level}: ${message}`);
  });

  return NextResponse.json({
    ok:          true,
    handled:     result.handled,
    detail:      result.detail,
    contactId:   contact.id,
    conversationId: conv?.id ?? null,
    incomingText,
  });
}
