// ─── FILTRO CENTRAL ÚNICO del asistente comercial ──────────────────────────────
//
// shouldStartSalesAssistant() es el ÚNICO lugar que decide si el asistente puede
// hablar en una conversación. Devuelve start:true SÓLO para un lead legítimo
// (nuevo o en curso). Para todo lo demás — cliente, familiar, contacto interno,
// proveedor, conversación atendida por un humano, reserva activa, mensaje
// antiguo o ya cedida a una persona — devuelve start:false con el motivo.
//
// Se invoca desde:
//   • app/api/sales/run  (puente — único disparador en producción)
//   • lib/sales/assistant (defensa para llamadas directas/tests)
// Ambos llaman a ESTA función. No hay filtros ad-hoc repartidos por el código.

import type { createAdminClient } from "@/lib/supabase/admin";

type DB = ReturnType<typeof createAdminClient>;

/**
 * Etiquetas que EXCLUYEN a un contacto del asistente comercial. El equipo
 * etiqueta al contacto y el asistente lo respeta. Cubre: clientes existentes,
 * familiares, contactos internos/empleados, proveedores y cualquier contacto
 * que no deba recibir el discurso comercial (p. ej. otra empresa).
 */
export const EXCLUDED_TAGS = new Set([
  "cliente", "clienta", "clientes",
  "familiar", "familia", "personal",
  "interno", "interna", "empleado", "empleada", "staff", "equipo",
  "proveedor", "proveedora",
  "no-asistente", "no-bot", "sin-bot", "no-ia",
  "renovamax",
]);

/** Nombres con los que firma el propio asistente (todo lo demás = humano). */
export const BOT_AGENT_NAMES = new Set(["Recepción", "Recepcion", "FlowAI"]);

/** Estado de cita que indica una reserva ACTIVA/futura (gestión en curso). */
const ACTIVE_APPOINTMENT_STATUS = ["confirmed"] as const;

export interface GateInput {
  contactId:     string;
  tags:          string[] | null;
  customFields:  Record<string, unknown> | null | undefined;
  conversationId: string | null;
  incomingText:  string;
  /** Antigüedad del último entrante; si se omite, se salta la guarda de frescura. */
  lastInboundAt?: string | null;
  now?:          number;
  maxAgeMs?:     number;
}

export type GateReason =
  | "no-inbound-message" | "stale-inbound"
  | "excluded-tag" | "escalated-to-human"
  | "human-assigned" | "human-handoff" | "active-booking";

export type GateDecision =
  | { start: true;  reason: "new-lead" | "active-lead" }
  | { start: false; reason: GateReason; detail?: string };

/**
 * ÚNICA verdad sobre si el asistente comercial debe intervenir.
 * Orden de comprobación: entrante real → frescura → exclusión → cesión a humano
 * → operador humano → reserva activa. A la primera que falle, sale.
 */
export async function shouldStartSalesAssistant(db: DB, input: GateInput): Promise<GateDecision> {
  const now    = input.now ?? Date.now();
  const maxAge = input.maxAgeMs ?? Number(process.env.SALES_TRIGGER_MAX_AGE_MS ?? 900_000); // 15 min
  const tags   = (input.tags ?? []).map((t) => String(t).toLowerCase());
  const custom = (input.customFields ?? {}) as Record<string, unknown>;
  const text   = (input.incomingText ?? "").trim();

  // 1. Debe existir un mensaje entrante REAL.
  if (!text && !input.lastInboundAt) return { start: false, reason: "no-inbound-message" };

  // 2. Frescura: nada de conversaciones antiguas / reprocesos / sincronizaciones.
  if (input.lastInboundAt) {
    const ageMs = now - new Date(input.lastInboundAt).getTime();
    if (ageMs > maxAge) return { start: false, reason: "stale-inbound", detail: String(ageMs) };
  }

  // 3. Contacto excluido: cliente, familiar, interno, proveedor, empleado…
  const excluded = tags.find((t) => EXCLUDED_TAGS.has(t));
  if (excluded) return { start: false, reason: "excluded-tag", detail: excluded };

  // 4. Conversación ya cedida a una persona por el propio asistente.
  if (custom.escalated_to_human === true) return { start: false, reason: "escalated-to-human" };

  // 5. Operador humano al mando de la conversación.
  if (input.conversationId) {
    const { data: conv } = await db
      .from("conversations")
      .select("assigned_to")
      .eq("id", input.conversationId)
      .maybeSingle();
    if (conv?.assigned_to) return { start: false, reason: "human-assigned" };

    // Último mensaje saliente MANUAL (agent_name que no es del bot) = hay un humano.
    const { data: lastOut } = await db
      .from("messages")
      .select("agent_name")
      .eq("conversation_id", input.conversationId)
      .eq("sender", "agent")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastOut && !BOT_AGENT_NAMES.has(lastOut.agent_name ?? "")) {
      return { start: false, reason: "human-handoff" };
    }
  }

  // 6. Reserva activa (cita futura/reciente) → gestión en curso, no re-abordar.
  const { data: appt } = await db
    .from("appointments")
    .select("id")
    .eq("contact_id", input.contactId)
    .in("status", [...ACTIVE_APPOINTMENT_STATUS])
    .gte("scheduled_at", new Date(now - 3_600_000).toISOString())
    .limit(1)
    .maybeSingle();
  if (appt) return { start: false, reason: "active-booking" };

  // ✅ Lead legítimo. "new-lead" si nunca se le saludó; "active-lead" si ya está
  //    en el embudo (el asistente decide saludar vs continuar con assistant_initialized).
  const initialized = custom.assistant_initialized === true;
  return { start: true, reason: initialized ? "active-lead" : "new-lead" };
}
