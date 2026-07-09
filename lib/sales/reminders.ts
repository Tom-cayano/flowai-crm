// Recordatorios automáticos de citas — 24 h y 1 h antes.
//
// Se ejecuta en el tick periódico del worker (junto a cron-runner). Los flags
// reminder_*_sent_at en appointments hacen el envío idempotente aunque el
// worker se reinicie o el tick se solape.

import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueOutbound } from "@/lib/queue/producers";
import { COPY, KIND_LABEL } from "./knowledge";
import { formatSlot } from "./slots";

const H24 = 24 * 3_600_000;
const H1  = 3_600_000;

export async function sendAppointmentReminders(): Promise<void> {
  const db  = createAdminClient();
  const now = Date.now();

  const { data: appts, error } = await db
    .from("appointments")
    .select("id, user_id, kind, scheduled_at, contact_phone, conversation_id, reminder_24h_sent_at, reminder_1h_sent_at")
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

    console.info(`[sales/reminders] ${flag === "reminder_1h_sent_at" ? "1h" : "24h"} enviado — cita ${appt.id}`);
  }
}
