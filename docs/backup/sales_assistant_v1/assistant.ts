// Recepcionista comercial de doble negocio sobre un único WhatsApp:
//   • LOVE FITNESS MURCIA  (presencial / context "gym")
//   • TRANSFORMA FIT COACH (online     / context "online")
//
// Detecta automáticamente el negocio, recuerda el contexto en
// contacts.custom_fields y NUNCA mezcla respuestas de ambos. Cierra ventas
// con el enlace correcto de cada negocio. Determinista (no depende de OpenAI):
//   - Gimnasio: info de planes, clase de prueba con horario abierto (el equipo
//     confirma disponibilidad), inscripción → lovefitness.es
//   - Online: app/coach/nutrición, valoración gratuita con hueco reservable
//     (Google Calendar), contratación → transformacuerpo.com
//
// Se ejecuta como acción del motor (nativa `sales_assistant` o vía el puente
// /api/sales/run mientras el worker no tenga el código nuevo).

import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueOutbound } from "@/lib/queue/producers";
import type { ExecutionContext } from "@/types/automation";
import type { Json } from "@/types/supabase";
import {
  classifyBusiness,
  mentionsOtherBusiness,
  detectPurchaseIntent,
  detectTrialIntent,
  detectValoracionIntent,
  detectSnooze,
  detectInfoQuestion,
  parseNumericChoice,
  COPY,
  AMBIGUITY_ASK,
  GYM_MENU,
  GYM_PLAN_DETAILS,
  GYM_AFTER_PLAN,
  GYM_TRIAL_PITCH,
  GYM_TRIAL_CAPTURED,
  GYM_CLOSE,
  ONLINE_INFO,
  ONLINE_CLOSE,
  OBJECTIVE_QUESTION,
  recommendPlan,
  SWITCH_OFFER,
  SNOOZE_ASK,
  SNOOZE_CONFIRM,
  type BusinessContext,
} from "./knowledge";
import { getFreeSlots, formatSlot } from "./slots";
import { createCalendarEvent } from "./google-calendar";
import { getSalesConfig, applyConfigToClose } from "./config";

type Logger = (level: "debug" | "info" | "warn" | "error", message: string) => Promise<void>;

type FunnelState =
  | "reception" | "switch_offer"
  | "gym_menu" | "gym_after_plan" | "gym_trial_when" | "gym_advisor" | "gym_trial_pending"
  | "online_info" | "awaiting_channel" | "awaiting_slot" | "online_advisor"
  | "booked" | "snooze_ask" | "snoozed";

interface Funnel {
  funnel_context?:  BusinessContext;         // memoria del negocio activo
  funnel_state?:    FunnelState;
  funnel_channel?:  "video" | "llamada";     // online: canal de la valoración
  funnel_slots?:    string[];                // ISO de huecos ofrecidos
  funnel_switch_to?: BusinessContext;        // destino del cambio de contexto
  funnel_appointment_id?: string;
  snooze_until?:    string;
  /**
   * Protección permanente del saludo: se pone a true en cuanto el asistente
   * envía su PRIMER mensaje de bienvenida a este contacto. Mientras sea true,
   * el saludo inicial NUNCA vuelve a enviarse (evita re-saludar al reabrir una
   * conversación antigua, al sincronizar historial o ante triggers repetidos).
   */
  assistant_initialized?: boolean;
}

/**
 * Contactos que el recepcionista comercial NUNCA debe saludar, aunque el
 * trigger se dispare: clientes existentes, proveedores, conversaciones internas
 * y cualquier contacto de otra empresa (p. ej. Renovamax). La detección es por
 * etiqueta del contacto — el equipo etiqueta y el asistente respeta.
 */
const EXCLUDED_TAGS = new Set([
  "cliente", "proveedor", "interno", "no-asistente", "renovamax",
]);

export interface SalesAssistantResult {
  handled: boolean;
  detail:  string;
}

/** Puerto de salida — inyectable para tests. Por defecto encola en wpp-outbound. */
export interface SalesAssistantDeps {
  send?: (payload: {
    phone: string; content: string; conversationId: string; userId: string;
    instanceName: string; serverUrl: string; apiKey: string;
  }) => Promise<unknown>;
}

// ─── Entrada principal ────────────────────────────────────────────────────────

export async function runSalesAssistant(
  ctx: ExecutionContext,
  log: Logger,
  deps: SalesAssistantDeps = {}
): Promise<SalesAssistantResult> {
  const db = createAdminClient();
  if (!ctx.contactId) return { handled: false, detail: "sin contacto" };

  const { data: contact } = await db
    .from("contacts")
    .select("id, name, email, phone, tags, source, custom_fields")
    .eq("id", ctx.contactId)
    .maybeSingle();
  if (!contact) return { handled: false, detail: "contacto no encontrado" };

  // Exclusión permanente: clientes existentes, proveedores, conversaciones
  // internas y contactos de otras empresas (Renovamax…) nunca son saludados.
  const excludedTag = (contact.tags ?? []).find((t) => EXCLUDED_TAGS.has(String(t).toLowerCase()));
  if (excludedTag) {
    await log("info", `Trigger bloqueado — contacto excluido (tag "${excludedTag}")`);
    return { handled: false, detail: `excluido:${excludedTag}` };
  }

  const custom = (contact.custom_fields ?? {}) as Record<string, unknown> & Funnel;
  const text   = ctx.incomingText ?? "";
  const firstName = (contact.name ?? "").trim().split(/\s+/)[0] || "";

  // Configuración editable (Supabase) con fallback a defaults del código.
  const cfg = await getSalesConfig(ctx.userId);

  const reply = (content: string) =>
    deps.send
      ? deps.send({
          phone: ctx.phone, content, conversationId: ctx.conversationId ?? "", userId: ctx.userId,
          instanceName: ctx.instanceName, serverUrl: ctx.serverUrl, apiKey: ctx.instanceApiKey,
        })
      : enqueueOutbound({
          instanceName: ctx.instanceName, serverUrl: ctx.serverUrl, apiKey: ctx.instanceApiKey,
          phone: ctx.phone, content, type: "text", conversationId: ctx.conversationId ?? "",
          userId: ctx.userId, origin: "automation", agentName: "Recepción",
        });

  const saveFunnel = async (patch: Funnel): Promise<void> => {
    await db.from("contacts").update({ custom_fields: { ...custom, ...patch } as Json }).eq("id", contact.id);
    Object.assign(custom, patch);
  };
  const addTags = async (tags: string[]): Promise<void> => {
    const merged = [...new Set([...(contact.tags ?? []), ...tags])];
    await db.from("contacts").update({ tags: merged }).eq("id", contact.id);
  };
  const note = async (body: string): Promise<void> => {
    if (!ctx.conversationId) return;
    await db.from("messages").insert({
      conversation_id: ctx.conversationId, content: `[Nota interna] ${body}`,
      type: "text", sender: "agent", status: "sent", agent_name: "FlowAI",
    });
  };

  let state   = custom.funnel_state ?? null;
  let context = custom.funnel_context ?? null;

  // ── Recuperación de leads (no insistir) ────────────────────────────────────
  if (state !== "booked" && state !== "snooze_ask" && detectSnooze(text)) {
    await reply(SNOOZE_ASK);
    await saveFunnel({ funnel_state: "snooze_ask" });
    await log("info", "Lead pospone — preguntando mañana/semana");
    return { handled: true, detail: "snooze:preguntado" };
  }
  if (state === "snooze_ask") {
    const choice = parseNumericChoice(text, 2);
    const days   = choice === 2 ? 7 : 1;
    const until  = new Date(Date.now() + days * 86_400_000); until.setUTCHours(9, 0, 0, 0);
    await reply(SNOOZE_CONFIRM(days === 1 ? "mañana" : "la semana que viene"));
    await saveFunnel({ funnel_state: "snoozed", snooze_until: until.toISOString() });
    await addTags(["seguimiento-programado"]);
    return { handled: true, detail: `snooze:${days}d` };
  }
  if (state === "snoozed") { await saveFunnel({ funnel_state: undefined, snooze_until: undefined }); state = null; }

  // ── Guarda permanente del saludo inicial ───────────────────────────────────
  // Si este contacto ya fue saludado (assistant_initialized=true) pero perdió el
  // estado (conversación reabierta, historial sincronizado, trigger repetido),
  // NUNCA se reenvía el saludo. Sólo se permite avanzar si el texto ya indica un
  // negocio concreto (progreso real, no un re-saludo).
  if (!state && custom.assistant_initialized) {
    const biz = classifyBusiness(text);
    if (biz) return enterBusiness(biz);
    await log("info", "Saludo inicial bloqueado — assistant_initialized=true (no se re-saluda)");
    return { handled: false, detail: "welcome:bloqueado-ya-inicializado" };
  }

  // ── Lead de Transforma Fit Coach (webhook): contexto online directo ────────
  if (!state && contact.source === "transforma-fit-coach") {
    context = "online";
    await saveFunnel({ funnel_context: "online", funnel_state: "awaiting_channel", assistant_initialized: true });
    await reply(COPY.onlineGreeting(firstName || "¡bienvenido/a!"));
    await addTags(["cliente-potencial", "funnel-online"]);
    await log("info", "Lead Transforma → valoración online (canal)");
    return { handled: true, detail: "online:saludo" };
  }

  // ── ENTRADA sin estado: clasificar negocio o saludar como recepcionista ────
  if (!state) {
    const biz = classifyBusiness(text);
    if (!biz) {
      await reply(cfg.welcome);
      await saveFunnel({ funnel_state: "reception", assistant_initialized: true });
      await addTags(["cliente-potencial", "lead-nuevo"]);
      await log("info", "Recepción — saludo doble negocio");
      return { handled: true, detail: "reception:saludo" };
    }
    return enterBusiness(biz);
  }

  // ── RECEPCIÓN: elegir 1 gimnasio / 2 online ────────────────────────────────
  if (state === "reception") {
    const c = parseNumericChoice(text, 2);
    if (c === null) {
      const biz = classifyBusiness(text);
      if (biz) return enterBusiness(biz);
      await reply(AMBIGUITY_ASK);
      return { handled: true, detail: "reception:reask" };
    }
    return enterBusiness(c === 1 ? "gym" : "online");
  }

  // ── CAMBIO DE CONTEXTO ─────────────────────────────────────────────────────
  const inBooking = state === "awaiting_slot" || state === "awaiting_channel" || state === "gym_trial_when";
  if (state === "switch_offer") {
    const c = parseNumericChoice(text, 2);
    if (c === 1) {
      const target = custom.funnel_switch_to ?? (context === "gym" ? "online" : "gym");
      return enterBusiness(target);
    }
    // No → seguir en el negocio actual
    return enterBusiness(context ?? "gym");
  }
  if (context && !inBooking && mentionsOtherBusiness(text, context)) {
    await reply(SWITCH_OFFER(context));
    await saveFunnel({ funnel_state: "switch_offer", funnel_switch_to: context === "gym" ? "online" : "gym" });
    await log("info", `Ofreciendo cambio de contexto desde ${context}`);
    return { handled: true, detail: "switch:offer" };
  }

  // ── CIERRE DE VENTA (solo con intención clara y contexto establecido) ──────
  if (context && !inBooking && detectPurchaseIntent(text)) {
    await reply(context === "gym" ? applyConfigToClose(GYM_CLOSE, cfg, "gym") : applyConfigToClose(ONLINE_CLOSE, cfg, "online"));
    await addTags(["lead-caliente", context === "gym" ? "cierre-gym" : "cierre-online"]);
    await log("info", `Cierre de venta ${context} — enlace enviado`);
    return { handled: true, detail: `close:${context}` };
  }

  // ════════════════ FLUJO GIMNASIO (Love Fitness) ════════════════
  if (context === "gym") {
    if (state === "gym_menu" || state === "gym_after_plan") {
      let c = parseNumericChoice(text, state === "gym_menu" ? 5 : 2);
      // Preguntas sueltas de precio/horario
      const info = detectInfoQuestion(text);
      if (c === null && info) {
        await reply(info === "precios" ? cfg.pricingText : cfg.scheduleText);
        await reply(GYM_AFTER_PLAN);
        await saveFunnel({ funnel_state: "gym_after_plan" });
        return { handled: true, detail: `gym:info-${info}` };
      }
      if (/recomienda|recomiendas|cual me|cuál me|no se cual|no sé cuál|ayuda a elegir|que plan me/i.test(text)) {
        await reply(OBJECTIVE_QUESTION);
        await saveFunnel({ funnel_state: "gym_advisor" });
        return { handled: true, detail: "gym:advisor-inicio" };
      }
      if (state === "gym_after_plan") {
        if (c === 1) return gymTrial();
        if (c === 2) { await reply(GYM_MENU); await saveFunnel({ funnel_state: "gym_menu" }); return { handled: true, detail: "gym:menu" }; }
        c = null;
      }
      if (c === null) { await reply(COPY.fallbackNudge + "\n\n" + GYM_MENU); await saveFunnel({ funnel_state: "gym_menu" }); return { handled: true, detail: "gym:reask" }; }
      if (c >= 1 && c <= 3) {
        await reply(GYM_PLAN_DETAILS[c]!);
        await reply(GYM_AFTER_PLAN);
        await saveFunnel({ funnel_state: "gym_after_plan" });
        await log("info", `Gym → plan ${c}`);
        return { handled: true, detail: `gym:plan-${c}` };
      }
      if (c === 4) { await reply(cfg.scheduleText); await reply(GYM_AFTER_PLAN); await saveFunnel({ funnel_state: "gym_after_plan" }); return { handled: true, detail: "gym:horarios" }; }
      // c === 5
      return gymTrial();
    }

    if (state === "gym_trial_when") {
      // Horario abierto: capturamos la preferencia libre y confirmación manual.
      await addTags(["clase-prueba-solicitada", "lead-caliente", "seguimiento-manual"]);
      await note(`🏋️ Clase de prueba solicitada — ${contact.name || ctx.phone}. Preferencia del cliente: "${text}". Confirmar disponibilidad de monitor.`);
      if (ctx.conversationId) await db.from("conversations").update({ status: "pending" }).eq("id", ctx.conversationId);
      await reply(GYM_TRIAL_CAPTURED(firstName));
      await saveFunnel({ funnel_state: "gym_trial_pending" });
      await log("info", "Gym clase de prueba — preferencia capturada, confirmación manual");
      return { handled: true, detail: "gym:trial-capturado" };
    }

    if (state === "gym_advisor") {
      const obj = parseNumericChoice(text, 5);
      if (obj === null) { await reply(OBJECTIVE_QUESTION); return { handled: true, detail: "gym:advisor-reask" }; }
      await reply(recommendPlan("gym", obj));
      await saveFunnel({ funnel_state: "gym_after_plan" });
      await log("info", `Gym asesor → objetivo ${obj}`);
      return { handled: true, detail: `gym:advisor-${obj}` };
    }

    if (state === "gym_trial_pending" || state === "booked") {
      await reply("Un monitor te confirma enseguida 😊 Si necesitas algo más, dímelo por aquí.");
      return { handled: true, detail: "gym:pending" };
    }

    // fallback dentro de gym
    await reply(GYM_MENU); await saveFunnel({ funnel_state: "gym_menu" });
    return { handled: true, detail: "gym:fallback-menu" };
  }

  // ════════════════ FLUJO ONLINE (Transforma) ════════════════
  if (context === "online") {
    if (state === "online_info") {
      const c = parseNumericChoice(text, 2);
      if (c === 1) return onlineOfferChannel();
      if (c === 2) { await reply(OBJECTIVE_QUESTION); await saveFunnel({ funnel_state: "online_advisor" }); return { handled: true, detail: "online:advisor-inicio" }; }
      await reply(COPY.fallbackNudge + "\n\n" + ONLINE_INFO);
      return { handled: true, detail: "online:reask" };
    }

    if (state === "online_advisor") {
      const obj = parseNumericChoice(text, 5);
      if (obj === null) { await reply(OBJECTIVE_QUESTION); return { handled: true, detail: "online:advisor-reask" }; }
      await reply(recommendPlan("online", obj));
      await saveFunnel({ funnel_state: "online_info" });
      await log("info", `Online asesor → objetivo ${obj}`);
      return { handled: true, detail: `online:advisor-${obj}` };
    }

    if (state === "awaiting_channel") {
      const c = parseNumericChoice(text, 2);
      if (c === null) { await reply(COPY.reofferChannel); return { handled: true, detail: "online:reask-canal" }; }
      const channel: "video" | "llamada" = c === 1 ? "video" : "llamada";
      const slots = await getFreeSlots(ctx.userId);
      if (slots.length === 0) {
        await reply("Esta semana está completa 😅 Un compañero te escribirá para buscarte hueco.");
        await addTags(["seguimiento-manual"]);
        return { handled: true, detail: "online:sin-huecos" };
      }
      await reply(COPY.askSlot(slots.map((s) => s.label)));
      await saveFunnel({ funnel_channel: channel, funnel_state: "awaiting_slot", funnel_slots: slots.map((s) => s.at.toISOString()) });
      await log("info", `Online canal ${channel} — ${slots.length} huecos`);
      return { handled: true, detail: `online:canal-${channel}` };
    }

    if (state === "awaiting_slot") {
      const offered = (custom.funnel_slots ?? []).map((iso) => new Date(iso));
      const choice  = parseNumericChoice(text, offered.length);
      if (choice === null || !offered[choice - 1]) {
        const slots = await getFreeSlots(ctx.userId);
        if (slots.length > 0) { await reply(COPY.askSlot(slots.map((s) => s.label))); await saveFunnel({ funnel_slots: slots.map((s) => s.at.toISOString()) }); }
        else await reply(COPY.fallbackNudge);
        return { handled: true, detail: "online:reask-hueco" };
      }
      return bookAppointment({ ctx, db, log, reply, saveFunnel, addTags, contact, custom, chosen: offered[choice - 1] });
    }

    if (state === "booked") {
      if (/\b(cancelar|cambiar|anular|reprogramar)\b/i.test(text)) {
        await addTags(["seguimiento-manual"]);
        if (ctx.conversationId) await db.from("conversations").update({ status: "pending" }).eq("id", ctx.conversationId);
        await reply("Sin problema 😊 Un compañero te escribe ahora mismo para recolocar tu cita.");
        return { handled: true, detail: "online:cambio" };
      }
      await reply(COPY.afterBooked);
      return { handled: true, detail: "online:recordatorio" };
    }

    // fallback dentro de online
    await reply(ONLINE_INFO); await saveFunnel({ funnel_state: "online_info" });
    return { handled: true, detail: "online:fallback-info" };
  }

  return { handled: false, detail: `estado sin contexto: ${state}` };

  // ─── Helpers de negocio (cierres sobre el scope de runSalesAssistant) ──────

  async function enterBusiness(biz: BusinessContext): Promise<SalesAssistantResult> {
    context = biz;
    if (biz === "gym") {
      await saveFunnel({ funnel_context: "gym", assistant_initialized: true });
      await addTags(["cliente-potencial", "contexto-gimnasio"]);
      // Atajo: si ya pide clase de prueba, no pasamos por el menú.
      if (detectTrialIntent(text)) { await log("info", "Contexto → GIMNASIO (clase de prueba directa)"); return gymTrial(); }
      await reply(GYM_MENU);
      await saveFunnel({ funnel_state: "gym_menu" });
      await log("info", "Contexto → GIMNASIO");
      return { handled: true, detail: "gym:menu" };
    }
    await saveFunnel({ funnel_context: "online", assistant_initialized: true });
    await addTags(["cliente-potencial", "contexto-online"]);
    // Atajo: si ya pide valoración, saltamos directo a la elección de canal.
    if (detectValoracionIntent(text)) { await log("info", "Contexto → ONLINE (valoración directa)"); return onlineOfferChannel(); }
    await reply(ONLINE_INFO);
    await saveFunnel({ funnel_state: "online_info" });
    await log("info", "Contexto → ONLINE");
    return { handled: true, detail: "online:info" };
  }

  async function gymTrial(): Promise<SalesAssistantResult> {
    await reply(cfg.trialPrice === "10 €" ? GYM_TRIAL_PITCH : GYM_TRIAL_PITCH.replace("10 €", cfg.trialPrice));
    await saveFunnel({ funnel_state: "gym_trial_when" });
    await addTags(["interes-clase-prueba"]);
    await log("info", "Gym → clase de prueba (horario abierto)");
    return { handled: true, detail: "gym:trial-pitch" };
  }

  async function onlineOfferChannel(): Promise<SalesAssistantResult> {
    await reply(COPY.reofferChannel);
    await saveFunnel({ funnel_state: "awaiting_channel" });
    await addTags(["funnel-online"]);
    await log("info", "Online → elección de canal de valoración");
    return { handled: true, detail: "online:canal-pregunta" };
  }
}

// ─── Reserva de valoración online (Google Calendar + CRM) ─────────────────────

async function bookAppointment(opts: {
  ctx:        ExecutionContext;
  db:         ReturnType<typeof createAdminClient>;
  log:        Logger;
  reply:      (content: string) => Promise<unknown>;
  saveFunnel: (patch: Funnel) => Promise<void>;
  addTags:    (tags: string[]) => Promise<void>;
  contact:    { id: string; name: string; email: string | null; phone: string | null; source: string | null; custom_fields: Json };
  custom:     Record<string, unknown> & Funnel;
  chosen:     Date;
}): Promise<SalesAssistantResult> {
  const { ctx, db, log, reply, saveFunnel, addTags, contact, custom, chosen } = opts;

  const kind = custom.funnel_channel === "llamada" ? "valoracion_llamada" : "valoracion_video";
  const goal = typeof custom.goal === "string" ? custom.goal : null;

  const { data: appt, error } = await db
    .from("appointments")
    .insert({
      user_id: ctx.userId, contact_id: contact.id, conversation_id: ctx.conversationId,
      kind, scheduled_at: chosen.toISOString(), duration_minutes: 15,
      contact_name: contact.name ?? "", contact_phone: contact.phone ?? ctx.phone,
      goal, lead_source: contact.source,
    })
    .select("id").single();

  if (error) {
    if (error.code === "23505") {
      const slots = await getFreeSlots(ctx.userId);
      if (slots.length > 0) { await reply(`${COPY.slotTaken}\n` + COPY.askSlot(slots.map((s) => s.label)).split("\n").slice(1).join("\n")); await saveFunnel({ funnel_slots: slots.map((s) => s.at.toISOString()) }); }
      else { await reply("Esta semana está completa 😅 Un compañero te escribirá para buscarte hueco."); await addTags(["seguimiento-manual"]); }
      await log("warn", `Doble reserva evitada en ${chosen.toISOString()}`);
      return { handled: true, detail: "hueco-ocupado" };
    }
    await log("error", `No se pudo crear la cita: ${error.message}`);
    await reply("Ha habido un problema al reservar 😅 Un compañero te confirma el hueco enseguida.");
    await addTags(["seguimiento-manual"]);
    return { handled: true, detail: "error-reserva" };
  }

  const kindLabel = kind === "valoracion_video" ? "Valoración gratuita (videollamada)" : "Valoración gratuita (llamada)";
  const cal = await createCalendarEvent({
    summary: `${kindLabel} — ${contact.name || ctx.phone}`,
    description:
      `Reserva automática del asistente de FlowAI CRM\nNombre: ${contact.name}\n` +
      `Teléfono: ${contact.phone ?? ctx.phone}\nObjetivo: ${goal ?? "—"}\n` +
      `Origen: ${contact.source ?? "WhatsApp directo"}\nTipo: ${kindLabel}`,
    start: chosen, durationMinutes: 15, attendeeEmail: contact.email,
    withMeet: kind === "valoracion_video",
  });
  if (cal.eventId || cal.meetLink) {
    await db.from("appointments").update({ calendar_event_id: cal.eventId, meet_link: cal.meetLink }).eq("id", appt.id);
  }

  await addTags(["valoracion-reservada", "lead-caliente"]);
  await saveFunnel({ funnel_state: "booked", funnel_appointment_id: appt.id, funnel_slots: [] });

  const fecha = formatSlot(chosen);
  if (ctx.conversationId) {
    await db.from("messages").insert({
      conversation_id: ctx.conversationId,
      content: `[Nota interna] 📅 ${kindLabel} reservada para el ${fecha}` +
               (cal.meetLink ? ` · Meet: ${cal.meetLink}` : "") +
               (cal.eventId ? " · Google Calendar" : " · Google Calendar no configurado (solo CRM)"),
      type: "text", sender: "agent", status: "sent", agent_name: "FlowAI",
    });
  }

  await reply(COPY.confirmOnline(fecha, kind === "valoracion_video" ? "video" : "llamada", cal.meetLink));

  if (contact.email) {
    const { queueEmail } = await import("@/lib/email/send");
    const { data: tpl } = await db.from("email_templates").select("subject, body_html").eq("user_id", ctx.userId).eq("slug", "reserva").maybeSingle();
    if (tpl) {
      await queueEmail({
        userId: ctx.userId, to: contact.email, subject: tpl.subject, bodyHtml: tpl.body_html,
        vars: {
          nombre: (contact.name ?? "").split(/\s+/)[0] ?? "", tipo_cita: kindLabel.toLowerCase(), fecha,
          detalle: cal.meetLink ? `Enlace de la videollamada: ${cal.meetLink}` : "Te llamaremos al teléfono que nos facilitaste.",
        },
        contactId: contact.id, conversationId: ctx.conversationId, templateSlug: "reserva", origin: "automation",
      }).catch((err) => console.error("[sales] email confirmación falló:", err));
    }
  }

  await log("info", `✅ ${kindLabel} reservada para ${fecha} (cita ${appt.id})`);
  return { handled: true, detail: `reservado:${kind}` };
}
