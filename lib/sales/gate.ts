// ─── FILTRO CENTRAL ÚNICO del asistente comercial ──────────────────────────────
//
// shouldStartSalesAssistant() es el ÚNICO lugar que decide si el asistente puede
// hablar en una conversación, y el ÚNICO que reserva la respuesta (idempotencia).
// Devuelve start:true SÓLO para un lead legítimo, una única vez por mensaje.
// Para todo lo demás — cliente, familiar, empleado, proveedor, interno, no-bot,
// conversación asignada/atendida por un humano, IA desactivada, conversación
// cerrada, reserva activa, mensaje antiguo, mensaje ya respondido — start:false.
//
// Se invoca desde:
//   • app/api/sales/run   (puente — único disparador en producción; pasa el
//                          external_id del entrante para la idempotencia)
//   • lib/sales/assistant (defensa para llamadas directas/tests; sin external_id)
// NINGÚN otro sitio puede hacer hablar al asistente sin pasar por aquí.
//
// Efectos colaterales DELIBERADOS (por eso es el guardián único):
//   • al detectar un humano → persiste custom_fields.ia_disabled=true
//     (desactivación PERMANENTE; sólo se reactiva a mano vía /api/sales/reactivate).
//   • al conceder respuesta con external_id → reserva
//     custom_fields.last_answered_external_id (una sola respuesta por mensaje).

import type { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/supabase";

type DB = ReturnType<typeof createAdminClient>;

/**
 * Etiquetas que EXCLUYEN a un contacto del asistente comercial. Cubre clientes,
 * familiares, contactos personales/internos, empleados, proveedores y cualquiera
 * que no deba recibir el discurso comercial.
 */
export const EXCLUDED_TAGS = new Set([
  "cliente", "clienta", "clientes",
  "familiar", "familia", "personal", "amigo", "amiga",
  "interno", "interna", "empleado", "empleada", "staff", "equipo", "socio", "socia",
  "proveedor", "proveedora",
  "no-asistente", "no-bot", "sin-bot", "no-ia", "bloqueado",
  "renovamax",
]);

/** Nombres con los que firma el propio asistente (todo lo demás = humano). */
export const BOT_AGENT_NAMES = new Set(["Recepción", "Recepcion", "FlowAI"]);

/** Estado de cita = reserva ACTIVA/futura (gestión en curso → cliente/agenda). */
const ACTIVE_APPOINTMENT_STATUS = ["confirmed"] as const;

/** Estados de conversación en los que el asistente NO debe intervenir. */
const CLOSED_CONVERSATION_STATUS = new Set(["resolved", "spam", "closed", "archived"]);

export interface GateInput {
  contactId:       string;
  tags:            string[] | null;
  customFields:    Record<string, unknown> | null | undefined;
  conversationId:  string | null;
  incomingText:    string;
  /** Antigüedad del último entrante; si se omite, se salta la guarda de frescura. */
  lastInboundAt?:  string | null;
  /** external_id del entrante (Evolution/Meta). Si se pasa, activa la idempotencia. */
  inboundExternalId?: string | null;
  now?:            number;
  maxAgeMs?:       number;
}

export type GateReason =
  | "no-inbound-message" | "stale-inbound"
  | "excluded-tag" | "ia-disabled" | "escalated-to-human"
  | "human-assigned" | "human-handoff"
  | "conversation-closed" | "active-booking"
  | "duplicate-message";

export type GateDecision =
  | { start: true;  reason: "new-lead" | "active-lead" }
  | { start: false; reason: GateReason; detail?: string };

/**
 * ÚNICA verdad sobre si el asistente comercial debe intervenir (y reserva de la
 * respuesta). Orden: entrante real → frescura → exclusión → IA desactivada →
 * operador humano → conversación cerrada → reserva activa → idempotencia.
 * A la primera que falle, sale.
 */
export async function shouldStartSalesAssistant(db: DB, input: GateInput): Promise<GateDecision> {
  const now    = input.now ?? Date.now();
  const maxAge = input.maxAgeMs ?? Number(process.env.SALES_TRIGGER_MAX_AGE_MS ?? 900_000); // 15 min
  const tags   = (input.tags ?? []).map((t) => String(t).toLowerCase());
  const custom = (input.customFields ?? {}) as Record<string, unknown>;
  const text   = (input.incomingText ?? "").trim();

  const persist = async (patch: Record<string, unknown>): Promise<void> => {
    await db.from("contacts")
      .update({ custom_fields: { ...custom, ...patch } as Json })
      .eq("id", input.contactId);
    Object.assign(custom, patch);
  };

  // 1. Debe existir un mensaje entrante REAL.
  if (!text && !input.lastInboundAt) return { start: false, reason: "no-inbound-message" };

  // 2. Frescura: nada de conversaciones antiguas / reprocesos / sincronizaciones.
  if (input.lastInboundAt) {
    const ageMs = now - new Date(input.lastInboundAt).getTime();
    if (ageMs > maxAge) return { start: false, reason: "stale-inbound", detail: String(ageMs) };
  }

  // 3. Contacto excluido: cliente, familiar, interno, proveedor, empleado, no-bot…
  const excluded = tags.find((t) => EXCLUDED_TAGS.has(t));
  if (excluded) return { start: false, reason: "excluded-tag", detail: excluded };

  // 4. IA desactivada de forma permanente (humano ya intervino, o escalado).
  if (custom.ia_disabled === true)        return { start: false, reason: "ia-disabled" };
  if (custom.escalated_to_human === true) return { start: false, reason: "escalated-to-human" };

  // 5. Operador humano al mando → DESACTIVA la IA para siempre en la conversación.
  if (input.conversationId) {
    const { data: conv } = await db
      .from("conversations")
      .select("assigned_to, status")
      .eq("id", input.conversationId)
      .maybeSingle();

    if (conv?.assigned_to) { await persist({ ia_disabled: true }); return { start: false, reason: "human-assigned" }; }

    const { data: lastOut } = await db
      .from("messages")
      .select("agent_name, created_at")
      .eq("conversation_id", input.conversationId)
      .eq("sender", "agent")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastOut && !BOT_AGENT_NAMES.has(lastOut.agent_name ?? "")) {
      // Solo desactiva si el mensaje manual es POSTERIOR a la última
      // reactivación manual (si no, la reactivación se desharía al instante).
      const reactivatedAt = custom.ia_reactivated_at ? new Date(String(custom.ia_reactivated_at)).getTime() : 0;
      const manualAt      = new Date(lastOut.created_at).getTime();
      if (manualAt > reactivatedAt) {
        await persist({ ia_disabled: true });        // humano escribió → IA off permanente
        return { start: false, reason: "human-handoff" };
      }
    }

    // 6. Conversación cerrada / resuelta / spam.
    if (conv?.status && CLOSED_CONVERSATION_STATUS.has(conv.status)) {
      return { start: false, reason: "conversation-closed", detail: conv.status };
    }
  }

  // 7. Reserva activa (cita confirmada futura/reciente) → cliente/agenda.
  const { data: appt } = await db
    .from("appointments")
    .select("id")
    .eq("contact_id", input.contactId)
    .in("status", [...ACTIVE_APPOINTMENT_STATUS])
    .gte("scheduled_at", new Date(now - 3_600_000).toISOString())
    .limit(1)
    .maybeSingle();
  if (appt) return { start: false, reason: "active-booking" };

  // 8. IDEMPOTENCIA — una sola respuesta por mensaje (aunque se reprocese N veces).
  //    Clave = external_id del entrante (estable ante reintentos de Redis/BullMQ/
  //    Meta/Evolution). Se reserva ANTES de responder.
  if (input.inboundExternalId) {
    if (custom.last_answered_external_id === input.inboundExternalId) {
      return { start: false, reason: "duplicate-message", detail: input.inboundExternalId };
    }
    await persist({ last_answered_external_id: input.inboundExternalId });
  }

  // ✅ Lead legítimo. new-lead si nunca se le saludó; active-lead si ya está en el
  //    embudo (el asistente decide saludar vs continuar con assistant_initialized).
  const initialized = custom.assistant_initialized === true;
  return { start: true, reason: initialized ? "active-lead" : "new-lead" };
}

/**
 * Reactivación MANUAL de la IA en una conversación (limpia ia_disabled y el
 * escalado). Es el ÚNICO modo de volver a activar el asistente tras la
 * intervención de un humano — no hay temporizadores ni reactivación automática.
 */
export async function reactivateSalesAssistant(db: DB, contactId: string): Promise<void> {
  const { data } = await db.from("contacts").select("custom_fields").eq("id", contactId).maybeSingle();
  const custom = (data?.custom_fields ?? {}) as Record<string, unknown>;
  delete custom.ia_disabled;
  delete custom.escalated_to_human;
  // Marca de reactivación: los mensajes manuales ANTERIORES ya no re-desactivan
  // la IA (solo un mensaje humano posterior a este instante lo hará).
  custom.ia_reactivated_at = new Date().toISOString();
  await db.from("contacts").update({ custom_fields: custom as Json }).eq("id", contactId);
}
