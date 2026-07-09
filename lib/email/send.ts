// Envío de email vía Resend — multi-tenant (cada organización usa su propia
// API key configurada en email_settings) con log + tracking en email_logs.
//
// Patrón idéntico a WhatsApp: el que quiere enviar crea el log y encola un
// EmailJob; el processor del worker entrega con reintentos exponenciales
// (BullMQ). Los estados posteriores (delivered/opened/clicked/bounced) los
// actualiza el webhook oficial de Resend.

import { createAdminClient } from "@/lib/supabase/admin";
import { interpolateVars, renderEmailLayout, type EmailVars } from "./templates";

export interface EmailSettings {
  resend_api_key: string;
  from_email:     string;
  from_name:      string | null;
  reply_to:       string | null;
}

export async function getEmailSettings(userId: string): Promise<EmailSettings | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("email_settings")
    .select("resend_api_key, from_email, from_name, reply_to, enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.enabled || !data.resend_api_key || !data.from_email) return null;
  return data as EmailSettings;
}

export interface EmailAttachment {
  filename: string;
  /** Contenido en base64 (formato de la API de Resend) */
  content:  string;
}

export interface QueueEmailOptions {
  userId:          string;
  to:              string;
  subject:         string;
  /** HTML interior — se envuelve en el layout responsive */
  bodyHtml:        string;
  vars?:           EmailVars;
  contactId?:      string | null;
  conversationId?: string | null;
  templateSlug?:   string | null;
  origin?:         "automation" | "manual" | "reminder" | "test";
  attachments?:    EmailAttachment[];
}

/**
 * Crea el log y encola el envío. Devuelve el id del log o null si el canal
 * no está configurado para este usuario (degradación silenciosa: el resto de
 * la automatización sigue funcionando).
 */
export async function queueEmail(opts: QueueEmailOptions): Promise<string | null> {
  const settings = await getEmailSettings(opts.userId);
  if (!settings) return null;

  const db = createAdminClient();
  const vars    = opts.vars ?? {};
  const subject = interpolateVars(opts.subject, vars);
  const html    = renderEmailLayout({
    bodyHtml:     interpolateVars(opts.bodyHtml, vars),
    businessName: settings.from_name ?? settings.from_email,
    preheader:    subject,
  });

  const { data: log, error } = await db
    .from("email_logs")
    .insert({
      user_id:         opts.userId,
      contact_id:      opts.contactId ?? null,
      conversation_id: opts.conversationId ?? null,
      template_slug:   opts.templateSlug ?? null,
      to_email:        opts.to,
      subject,
      origin:          opts.origin ?? "automation",
    })
    .select("id")
    .single();

  if (error || !log) {
    console.error("[email] No se pudo crear email_logs:", error?.message);
    return null;
  }

  const { enqueueEmailSend } = await import("@/lib/queue/producers");
  await enqueueEmailSend({
    logId:       log.id,
    userId:      opts.userId,
    to:          opts.to,
    subject,
    html,
    attachments: opts.attachments,
  });

  return log.id;
}

/**
 * Entrega real vía API de Resend. La llama el processor del worker —
 * lanza en caso de error para que BullMQ aplique los reintentos.
 */
export async function deliverEmail(job: {
  logId:        string;
  userId:       string;
  to:           string;
  subject:      string;
  html:         string;
  attachments?: EmailAttachment[];
}): Promise<void> {
  const db = createAdminClient();
  const settings = await getEmailSettings(job.userId);

  if (!settings) {
    await db.from("email_logs")
      .update({ status: "failed", error: "Canal email no configurado (email_settings)" })
      .eq("id", job.logId);
    return; // sin settings no hay nada que reintentar
  }

  const from = settings.from_name
    ? `${settings.from_name} <${settings.from_email}>`
    : settings.from_email;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.resend_api_key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [job.to],
      subject: job.subject,
      html: job.html,
      ...(settings.reply_to ? { reply_to: settings.reply_to } : {}),
      ...(job.attachments?.length ? { attachments: job.attachments } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };

  if (!res.ok) {
    const msg = `Resend ${res.status}: ${body.message ?? "error"}`;
    await db.from("email_logs")
      .update({ status: res.status >= 500 ? "queued" : "failed", error: msg })
      .eq("id", job.logId);
    // 4xx = definitivo (API key inválida, dominio sin verificar…); 5xx = reintentar
    if (res.status >= 500) throw new Error(msg);
    console.error(`[email] Envío rechazado (${job.logId}): ${msg}`);
    return;
  }

  await db.from("email_logs")
    .update({ status: "sent", resend_email_id: body.id ?? null, error: null })
    .eq("id", job.logId);
}
