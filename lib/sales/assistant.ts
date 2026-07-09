// Asistente comercial de Love Fitness Murcia / Transforma Fit Coach.
//
// Máquina de estados determinista cuyo objetivo es cerrar una reserva
// (valoración gratuita online o clase de prueba presencial) en ≤5 mensajes:
//
//   [entrada] → clasificar flujo (keywords / origen del lead)
//   ONLINE:     saludo con nombre → 1️⃣ video / 2️⃣ llamada → huecos → reserva
//   PRESENCIAL: pitch clase de prueba 10€ → huecos → reserva
//
// Reglas: mensajes breves, UNA pregunta por mensaje, opciones numeradas,
// nunca pedir datos que ya tenemos, nunca ofrecer horarios ocupados.
//
// El estado del funnel vive en contacts.custom_fields (funnel_*) — sin
// migraciones extra y visible desde el CRM. Cada paso queda en el historial
// (automation_step_logs vía `log` + nota interna al reservar).
//
// Se ejecuta como acción `sales_assistant` del motor de automatizaciones.

import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueOutbound } from "@/lib/queue/producers";
import type { ExecutionContext } from "@/types/automation";
import type { Json } from "@/types/supabase";
import {
  classifyFlow,
  detectInfoQuestion,
  parseNumericChoice,
  COPY,
  PRICING_TEXT,
  SCHEDULE_TEXT,
  type SalesFlow,
} from "./knowledge";
import { getFreeSlots, formatSlot } from "./slots";
import { createCalendarEvent } from "./google-calendar";

type Logger = (level: "debug" | "info" | "warn" | "error", message: string) => Promise<void>;

interface FunnelState {
  funnel_flow?:    SalesFlow;
  funnel_state?:   "awaiting_flow" | "awaiting_channel" | "awaiting_slot" | "booked";
  funnel_channel?: "video" | "llamada";
  funnel_slots?:   string[];   // ISO de los huecos ofrecidos (índice = opción-1)
  funnel_appointment_id?: string;
}

export interface SalesAssistantResult {
  handled: boolean;
  detail:  string;
}

// ─── Entrada principal ────────────────────────────────────────────────────────

export async function runSalesAssistant(
  ctx: ExecutionContext,
  log: Logger
): Promise<SalesAssistantResult> {
  const db = createAdminClient();

  if (!ctx.contactId) return { handled: false, detail: "sin contacto" };

  const { data: contact } = await db
    .from("contacts")
    .select("id, name, email, phone, tags, source, custom_fields")
    .eq("id", ctx.contactId)
    .maybeSingle();

  if (!contact) return { handled: false, detail: "contacto no encontrado" };

  const custom = (contact.custom_fields ?? {}) as Record<string, unknown> & FunnelState;
  const text   = ctx.incomingText ?? "";
  const firstName = (contact.name ?? "").trim().split(/\s+/)[0] || "";

  // ── Mensajería saliente por la cola estándar (rate limit + anti-ban) ──────
  const reply = async (content: string): Promise<void> => {
    await enqueueOutbound({
      instanceName:   ctx.instanceName,
      serverUrl:      ctx.serverUrl,
      apiKey:         ctx.instanceApiKey,
      phone:          ctx.phone,
      content,
      type:           "text",
      conversationId: ctx.conversationId ?? "",
      userId:         ctx.userId,
      origin:         "automation",
      agentName:      "Love Fitness",
    });
  };

  const saveFunnel = async (patch: FunnelState): Promise<void> => {
    await db
      .from("contacts")
      .update({ custom_fields: { ...custom, ...patch } as Json })
      .eq("id", contact.id);
    Object.assign(custom, patch);
  };

  const addTags = async (tags: string[]): Promise<void> => {
    const merged = [...new Set([...(contact.tags ?? []), ...tags])];
    await db.from("contacts").update({ tags: merged }).eq("id", contact.id);
  };

  // ── Estado actual ──────────────────────────────────────────────────────────
  let state = custom.funnel_state ?? null;
  let flow: SalesFlow | null = custom.funnel_flow ?? null;

  // Lead del webhook (Transforma Fit Coach): el saludo online ya se envió en
  // la automatización de nuevo lead → su primera respuesta es la elección
  // de canal.
  if (!state && contact.source === "transforma-fit-coach") {
    flow  = "online";
    state = "awaiting_channel";
    await saveFunnel({ funnel_flow: "online", funnel_state: "awaiting_channel" });
  }

  // ── Sin estado: clasificar el flujo por el mensaje ────────────────────────
  if (!state) {
    const detected = classifyFlow(text);
    if (!detected) {
      // Sin señal comercial: no intervenimos (podría ser un cliente actual
      // u otra conversación) — la automatización decide el fallback.
      return { handled: false, detail: "sin intención comercial detectada" };
    }
    if (detected === "online") {
      await reply(COPY.onlineGreeting(firstName || "¡bienvenido/a!"));
      await saveFunnel({ funnel_flow: "online", funnel_state: "awaiting_channel" });
      await addTags(["cliente-potencial", "funnel-online"]);
      await log("info", "Funnel ONLINE iniciado — saludo + elección de canal enviados");
      return { handled: true, detail: "online:saludo" };
    }
    // PRESENCIAL: pitch + horarios (dos mensajes, una sola pregunta)
    const slots = await getFreeSlots(ctx.userId);
    await reply(COPY.presencialPitch);
    if (slots.length === 0) {
      await reply("Esta semana está completa 😅 Un compañero te escribirá para buscarte hueco.");
      await addTags(["cliente-potencial", "funnel-presencial", "seguimiento-manual"]);
      await log("warn", "Funnel PRESENCIAL sin huecos libres — derivado a seguimiento manual");
      return { handled: true, detail: "presencial:sin-huecos" };
    }
    await reply(COPY.askSlot(slots.map((s) => s.label)));
    await saveFunnel({
      funnel_flow: "presencial",
      funnel_state: "awaiting_slot",
      funnel_slots: slots.map((s) => s.at.toISOString()),
    });
    await addTags(["cliente-potencial", "funnel-presencial"]);
    await log("info", `Funnel PRESENCIAL iniciado — pitch + ${slots.length} huecos ofrecidos`);
    return { handled: true, detail: "presencial:pitch+huecos" };
  }

  // ── Preguntas de información en cualquier punto: responder y reconducir ───
  const info = detectInfoQuestion(text);
  if (info && state !== "awaiting_slot") {
    await reply(info === "precios" ? PRICING_TEXT : SCHEDULE_TEXT);
    await log("info", `Pregunta de ${info} respondida (estado ${state})`);
    if (state === "awaiting_channel") await reply(COPY.reofferChannel);
    if (state === "booked")           await reply(COPY.afterBooked);
    return { handled: true, detail: `info:${info}` };
  }

  // ── ONLINE: elección de canal ─────────────────────────────────────────────
  if (state === "awaiting_channel") {
    const choice = parseNumericChoice(text, 2);
    if (choice === null) {
      await reply(COPY.reofferChannel);
      await log("info", "Elección de canal no reconocida — opciones reenviadas");
      return { handled: true, detail: "online:reask-canal" };
    }
    const channel = choice === 1 ? "video" : "llamada";
    const slots = await getFreeSlots(ctx.userId);
    if (slots.length === 0) {
      await reply("Esta semana está completa 😅 Un compañero te escribirá para buscarte hueco.");
      await addTags(["seguimiento-manual"]);
      await log("warn", "Funnel ONLINE sin huecos libres — derivado a seguimiento manual");
      return { handled: true, detail: "online:sin-huecos" };
    }
    await reply(COPY.askSlot(slots.map((s) => s.label)));
    await saveFunnel({
      funnel_channel: channel,
      funnel_state: "awaiting_slot",
      funnel_slots: slots.map((s) => s.at.toISOString()),
    });
    await log("info", `Canal elegido: ${channel} — ${slots.length} huecos ofrecidos`);
    return { handled: true, detail: `online:canal-${channel}` };
  }

  // ── Elección de hueco y reserva ───────────────────────────────────────────
  if (state === "awaiting_slot") {
    const offered = (custom.funnel_slots ?? []).map((iso) => new Date(iso));
    const choice  = parseNumericChoice(text, offered.length);

    if (choice === null || !offered[choice - 1]) {
      // Puede ser una pregunta de info justo antes de elegir
      if (info) {
        await reply(info === "precios" ? PRICING_TEXT : SCHEDULE_TEXT);
      }
      const slots = await getFreeSlots(ctx.userId);
      if (slots.length > 0) {
        await reply(COPY.askSlot(slots.map((s) => s.label)));
        await saveFunnel({ funnel_slots: slots.map((s) => s.at.toISOString()) });
      } else {
        await reply(COPY.fallbackNudge);
      }
      await log("info", "Elección de hueco no reconocida — huecos reenviados");
      return { handled: true, detail: "reask-hueco" };
    }

    const chosen = offered[choice - 1];
    return bookAppointment({ ctx, db, log, reply, saveFunnel, addTags, contact, custom, flow: flow ?? "presencial", chosen });
  }

  // ── Ya reservado ──────────────────────────────────────────────────────────
  if (state === "booked") {
    if (/\b(cancelar|cambiar|anular|no puedo|reprogramar)\b/i.test(text)) {
      await addTags(["seguimiento-manual"]);
      if (ctx.conversationId) {
        await db.from("conversations")
          .update({ status: "pending" })
          .eq("id", ctx.conversationId);
      }
      await reply("Sin problema 😊 Un compañero del equipo te escribe ahora mismo para recolocar tu cita.");
      await log("info", "Cliente pide cambiar/cancelar — derivado a seguimiento manual");
      return { handled: true, detail: "booked:cambio-solicitado" };
    }
    await reply(COPY.afterBooked);
    return { handled: true, detail: "booked:recordatorio-cita" };
  }

  return { handled: false, detail: `estado desconocido: ${state}` };
}

// ─── Reserva ──────────────────────────────────────────────────────────────────

async function bookAppointment(opts: {
  ctx:        ExecutionContext;
  db:         ReturnType<typeof createAdminClient>;
  log:        Logger;
  reply:      (content: string) => Promise<void>;
  saveFunnel: (patch: FunnelState) => Promise<void>;
  addTags:    (tags: string[]) => Promise<void>;
  contact:    { id: string; name: string; email: string | null; phone: string | null; source: string | null; custom_fields: Json };
  custom:     Record<string, unknown> & FunnelState;
  flow:       SalesFlow;
  chosen:     Date;
}): Promise<SalesAssistantResult> {
  const { ctx, db, log, reply, saveFunnel, addTags, contact, custom, flow, chosen } = opts;

  const kind =
    flow === "presencial" ? "clase_prueba"
    : custom.funnel_channel === "llamada" ? "valoracion_llamada"
    : "valoracion_video";

  const goal = typeof custom.goal === "string" ? custom.goal : null;

  // 1. Reservar en el CRM — el índice único garantiza que nadie ocupa el
  //    mismo hueco dos veces, aunque dos leads respondan a la vez.
  const { data: appt, error } = await db
    .from("appointments")
    .insert({
      user_id:         ctx.userId,
      contact_id:      contact.id,
      conversation_id: ctx.conversationId,
      kind,
      scheduled_at:    chosen.toISOString(),
      duration_minutes: kind === "clase_prueba" ? 60 : 15,
      contact_name:    contact.name ?? "",
      contact_phone:   contact.phone ?? ctx.phone,
      goal,
      lead_source:     contact.source,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Doble reserva evitada — reofrecer huecos actualizados
      const slots = await getFreeSlots(ctx.userId);
      if (slots.length > 0) {
        await reply(`${COPY.slotTaken}\n` + COPY.askSlot(slots.map((s) => s.label)).split("\n").slice(1).join("\n"));
        await saveFunnel({ funnel_slots: slots.map((s) => s.at.toISOString()) });
      } else {
        await reply("Esta semana está completa 😅 Un compañero te escribirá para buscarte hueco.");
        await addTags(["seguimiento-manual"]);
      }
      await log("warn", `Doble reserva evitada en ${chosen.toISOString()} — huecos reenviados`);
      return { handled: true, detail: "hueco-ocupado" };
    }
    await log("error", `No se pudo crear la cita: ${error.message}`);
    await reply("Ha habido un problema al reservar 😅 Un compañero te confirma el hueco enseguida.");
    await addTags(["seguimiento-manual"]);
    return { handled: true, detail: "error-reserva" };
  }

  // 2. Google Calendar (+ Meet si videollamada) — soft-fail
  const kindLabel =
    kind === "clase_prueba" ? "Clase de prueba" :
    kind === "valoracion_video" ? "Valoración gratuita (videollamada)" : "Valoración gratuita (llamada)";

  const cal = await createCalendarEvent({
    summary:     `${kindLabel} — ${contact.name || ctx.phone}`,
    description:
      `Reserva automática del asistente de FlowAI CRM\n` +
      `Nombre: ${contact.name}\nTeléfono: ${contact.phone ?? ctx.phone}\n` +
      `Objetivo: ${goal ?? "—"}\nOrigen: ${contact.source ?? "WhatsApp directo"}\nTipo: ${kindLabel}`,
    start:       chosen,
    durationMinutes: kind === "clase_prueba" ? 60 : 15,
    attendeeEmail: contact.email,
    withMeet:    kind === "valoracion_video",
  });

  if (cal.eventId || cal.meetLink) {
    await db.from("appointments")
      .update({ calendar_event_id: cal.eventId, meet_link: cal.meetLink })
      .eq("id", appt.id);
  }

  // 3. CRM: etiquetas, estado y nota en el historial
  const bookingTag = kind === "clase_prueba" ? "clase-prueba-reservada" : "valoracion-reservada";
  await addTags([bookingTag, "lead-caliente"]);
  await saveFunnel({ funnel_state: "booked", funnel_appointment_id: appt.id, funnel_slots: [] });

  const fecha = formatSlot(chosen);
  if (ctx.conversationId) {
    await db.from("messages").insert({
      conversation_id: ctx.conversationId,
      content: `[Nota interna] 📅 ${kindLabel} reservada para el ${fecha}` +
               (cal.meetLink ? ` · Meet: ${cal.meetLink}` : "") +
               (cal.eventId ? " · evento creado en Google Calendar" : " · Google Calendar no configurado (solo CRM)"),
      type: "text", sender: "agent", status: "sent", agent_name: "FlowAI",
    });
  }

  // 4. Confirmación al cliente
  await reply(
    kind === "clase_prueba"
      ? COPY.confirmPresencial(fecha)
      : COPY.confirmOnline(fecha, kind === "valoracion_video" ? "video" : "llamada", cal.meetLink)
  );

  await log("info",
    `✅ ${kindLabel} reservada para ${fecha} (cita ${appt.id})` +
    (cal.eventId ? " + Google Calendar" : "") + (cal.meetLink ? " + Meet" : "")
  );

  return { handled: true, detail: `reservado:${kind}` };
}
