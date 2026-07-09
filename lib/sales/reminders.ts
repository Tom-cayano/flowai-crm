// Recordatorios automáticos de citas — 24 h y 1 h antes.
//
// Se ejecuta en el tick periódico del worker (junto a cron-runner). Los flags
// reminder_*_sent_at en appointments hacen el envío idempotente aunque el
// worker se reinicie o el tick se solape.

import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueOutbound } from "@/lib/queue/producers";
import { COPY, KIND_LABEL, SNOOZE_NUDGE } from "./knowledge";
import { formatSlot } from "./slots";

const H24 = 24 * 3_600_000;
const H1  = 3_600_000;

export async function sendAppointmentReminders(): Promise<void> {
  const db  = createAdminClient();
  const now = Date.now();

  const { data: appts, error } = await db
    .from("appointments")
    .select("id, user_id, kind, scheduled_at, contact_phone, contact_id, conversation_id, reminder_24h_sent_at, reminder_1h_sent_at")
    .eq("status", "confirmed")
    .gte("scheduled_at", new Date(now).toISOString())
    .lte("scheduled_at", new Date(now + H24 + 600_000).toISOString());

  if (error) {
    console.error("[sales/reminders] query failed:", error.message);
    return;
  }
  if (!appts?.length) return;

  // Credenciales de la instancia WhatsApp por usuario (cache del tick)
  const credsCache = new Map<string, { instanceName: string; serverUrl: string; apiKey: string } | null>();
  const getCreds = async (userId: string) => {
    if (credsCache.has(userId)) return credsCache.get(userId)!;
    const { data } = await db
      .from("whatsapp_instances")
      .select("instance_name, server_url, api_key")
      .eq("user_id", userId)
      .eq("connection_state", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const creds = data
      ? { instanceName: data.instance_name, serverUrl: data.server_url, apiKey: data.api_key }
      : null;
    credsCache.set(userId, creds);
    return creds;
  };

  for (const appt of appts) {
    const msUntil = new Date(appt.scheduled_at).getTime() - now;
    const label   = KIND_LABEL[appt.kind] ?? "tu cita";

    let content: string | null = null;
    let flag: "reminder_24h_sent_at" | "reminder_1h_sent_at" | null = null;

    if (!appt.reminder_1h_sent_at && msUntil <= H1) {
      content = COPY.reminder1h(label);
      flag = "reminder_1h_sent_at";
    } else if (!appt.reminder_24h_sent_at && msUntil <= H24) {
      content = COPY.reminder24h(formatSlot(new Date(appt.scheduled_at)), label);
      flag = "reminder_24h_sent_at";
    }

    if (!content || !flag || !appt.contact_phone) continue;

    const creds = await getCreds(appt.user_id);
    if (!creds) {
      console.warn(`[sales/reminders] Sin instancia WhatsApp abierta para user ${appt.user_id}`);
      continue;
    }

    // Marcar ANTES de enviar (condicionado al valor previo) para que dos
    // ticks solapados nunca dupliquen el recordatorio.
    const stamp =
      flag === "reminder_1h_sent_at"
        ? { reminder_1h_sent_at: new Date().toISOString() }
        : { reminder_24h_sent_at: new Date().toISOString() };
    const { data: claimed } = await db
      .from("appointments")
      .update(stamp)
      .eq("id", appt.id)
      .is(flag, null)
      .select("id")
      .maybeSingle();

    if (!claimed) continue; // otro tick lo reclamó

    await enqueueOutbound({
      instanceName:   creds.instanceName,
      serverUrl:      creds.serverUrl,
      apiKey:         creds.apiKey,
      phone:          appt.contact_phone,
      content,
      type:           "text",
      conversationId: appt.conversation_id ?? "",
      userId:         appt.user_id,
      origin:         "automation",
      agentName:      "Love Fitness",
    }).catch((err) => console.error(`[sales/reminders] enqueue ${appt.id}:`, err));

    // Recordatorio también por email (si el contacto tiene y el canal está activo)
    await sendReminderEmail(db, appt, label, flag === "reminder_1h_sent_at" ? "1h" : "24h")
      .catch((err) => console.error(`[sales/reminders] email ${appt.id}:`, err));

    console.info(`[sales/reminders] ${flag === "reminder_1h_sent_at" ? "1h" : "24h"} enviado — cita ${appt.id}`);
  }
}

// ─── Email del recordatorio ──────────────────────────────────────────────────

async function sendReminderEmail(
  db: ReturnType<typeof createAdminClient>,
  appt: { id: string; user_id: string; kind: string; scheduled_at: string; contact_id: string | null; conversation_id: string | null },
  label: string,
  cuando: "24h" | "1h"
): Promise<void> {
  if (!appt.contact_id) return;
  const { data: contact } = await db
    .from("contacts").select("id, name, email").eq("id", appt.contact_id).maybeSingle();
  if (!contact?.email) return;

  const { data: tpl } = await db
    .from("email_templates")
    .select("subject, body_html")
    .eq("user_id", appt.user_id)
    .eq("slug", "recordatorio")
    .maybeSingle();
  if (!tpl) return;

  const { queueEmail } = await import("@/lib/email/send");
  await queueEmail({
    userId:         appt.user_id,
    to:             contact.email,
    subject:        tpl.subject,
    bodyHtml:       tpl.body_html,
    vars: {
      nombre:    (contact.name ?? "").split(/\s+/)[0] ?? "",
      tipo_cita: label,
      cuando:    cuando === "1h" ? "en 1 hora" : "mañana",
      fecha:     formatSlot(new Date(appt.scheduled_at)),
      detalle:   "",
    },
    contactId:      contact.id,
    conversationId: appt.conversation_id,
    templateSlug:   "recordatorio",
    origin:         "reminder",
  });
}

// ─── No asistió — estado + tarea + seguimiento ───────────────────────────────

/**
 * Citas confirmadas cuya hora pasó hace más de 2 h sin marcarse completadas:
 * estado no_show, etiqueta al contacto, tarea interna para el entrenador y
 * conversación pendiente para seguimiento.
 */
export async function handleNoShows(): Promise<void> {
  const db = createAdminClient();
  const cutoff = new Date(Date.now() - 2 * 3_600_000).toISOString();

  const { data: missed } = await db
    .from("appointments")
    .select("id, user_id, kind, scheduled_at, contact_id, conversation_id, contact_name, contact_phone")
    .eq("status", "confirmed")
    .lt("scheduled_at", cutoff)
    .limit(25);

  for (const appt of missed ?? []) {
    const { data: claimed } = await db
      .from("appointments")
      .update({ status: "no_show" })
      .eq("id", appt.id)
      .eq("status", "confirmed")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    if (appt.contact_id) {
      const { data: c } = await db.from("contacts").select("tags").eq("id", appt.contact_id).maybeSingle();
      const tags = [...new Set([...(c?.tags ?? []), "no-asistio", "seguimiento-manual"])];
      await db.from("contacts").update({ tags }).eq("id", appt.contact_id);
    }
    if (appt.conversation_id) {
      await db.from("conversations").update({ status: "pending" }).eq("id", appt.conversation_id);
      await db.from("messages").insert({
        conversation_id: appt.conversation_id,
        content: `[Nota interna] 📋 TAREA: ${appt.contact_name || appt.contact_phone} no asistió a ` +
                 `${KIND_LABEL[appt.kind] ?? "su cita"} (${formatSlot(new Date(appt.scheduled_at))}). ` +
                 "Contactar para reprogramar.",
        type: "text", sender: "agent", status: "sent", agent_name: "FlowAI",
      });
    }
    console.info(`[sales/no-show] Cita ${appt.id} marcada como no asistida`);
  }
}

// ─── Re-engagement de leads pospuestos ("mañana / la semana que viene") ──────

export async function sendSnoozeNudges(): Promise<void> {
  const db  = createAdminClient();
  const now = new Date().toISOString();

  const { data: contacts } = await db
    .from("contacts")
    .select("id, user_id, name, phone, custom_fields")
    .contains("tags", ["seguimiento-programado"])
    .limit(25);

  for (const c of contacts ?? []) {
    const custom = (c.custom_fields ?? {}) as Record<string, unknown>;
    if (custom.funnel_state !== "snoozed") continue;
    if (typeof custom.snooze_until !== "string" || custom.snooze_until > now) continue;
    if (!c.phone) continue;

    const { data: creds } = await db
      .from("whatsapp_instances")
      .select("instance_name, server_url, api_key")
      .eq("user_id", c.user_id)
      .eq("connection_state", "open")
      .limit(1)
      .maybeSingle();
    if (!creds) continue;

    // Reset del estado ANTES de enviar (idempotencia entre ticks)
    const newCustom = { ...custom, funnel_state: undefined, snooze_until: undefined };
    await db.from("contacts").update({
      custom_fields: JSON.parse(JSON.stringify(newCustom)),
    }).eq("id", c.id);

    const { data: conv } = await db
      .from("conversations").select("id").eq("contact_id", c.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    await enqueueOutbound({
      instanceName:   creds.instance_name,
      serverUrl:      creds.server_url,
      apiKey:         creds.api_key,
      phone:          c.phone,
      content:        SNOOZE_NUDGE((c.name ?? "").split(/\s+/)[0] ?? ""),
      type:           "text",
      conversationId: conv?.id ?? "",
      userId:         c.user_id,
      origin:         "automation",
      agentName:      "Love Fitness",
    }).catch((err) => console.error(`[sales/snooze] enqueue ${c.id}:`, err));

    console.info(`[sales/snooze] Re-engagement enviado a ${c.phone}`);
  }
}
