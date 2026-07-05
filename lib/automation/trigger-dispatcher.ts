// Trigger dispatcher — called by processors and server actions when non-message
// events occur (tag change, status change, lead score threshold, etc.).
//
// These functions construct an ExecutionContext from available data and hand off
// to runMatchingAutomations. They must run server-side (worker or server action).

import { createAdminClient } from "@/lib/supabase/admin";
import { runMatchingAutomations } from "./engine";
import type { ExecutionContext, TriggerType } from "@/types/automation";

// ─── Instance resolution helper ───────────────────────────────────────────────

interface InstanceCredentials {
  serverUrl:    string;
  instanceName: string;
  apiKey:       string;
}

async function resolveInstanceCredentials(
  userId: string
): Promise<InstanceCredentials> {
  const db = createAdminClient();
  const { data } = await db
    .from("whatsapp_instances")
    .select("server_url, instance_name, api_key")
    .eq("user_id", userId)
    .eq("connection_state", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    serverUrl:    data?.server_url    ?? process.env.EVOLUTION_SERVER_URL    ?? "",
    instanceName: data?.instance_name ?? "",
    apiKey:       data?.api_key       ?? process.env.EVOLUTION_API_KEY       ?? "",
  };
}

// ─── Context factory ──────────────────────────────────────────────────────────

async function buildCtxForConversation(
  userId: string,
  conversationId: string,
  triggerType: TriggerType,
  extra?: Partial<Pick<ExecutionContext, "incomingText" | "variables">>
): Promise<ExecutionContext | null> {
  const db = createAdminClient();

  const { data: conv } = await db
    .from("conversations")
    .select("id, contact_id, contact_phone, contact_name")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conv) return null;

  const creds = await resolveInstanceCredentials(userId);

  return {
    executionId:    "",   // assigned inside engine
    automationId:   "",   // assigned inside engine
    userId,
    conversationId,
    contactId:      conv.contact_id,
    phone:          conv.contact_phone ?? "",
    instanceName:   creds.instanceName,
    serverUrl:      creds.serverUrl,
    instanceApiKey: creds.apiKey,
    incomingText:   extra?.incomingText ?? "",
    isFirstMessage: false,
    triggerType,
    variables:      extra?.variables ?? {},
  };
}

// ─── Public dispatch functions ────────────────────────────────────────────────

export async function dispatchStatusChanged(opts: {
  userId:         string;
  conversationId: string;
  fromStatus:     string;
  toStatus:       string;
}): Promise<void> {
  const ctx = await buildCtxForConversation(
    opts.userId,
    opts.conversationId,
    "conversation_status_changed",
    {
      variables: {
        "conversation.status": opts.toStatus,
        "trigger.from_status": opts.fromStatus,
        "trigger.to_status":   opts.toStatus,
      },
    }
  );
  if (!ctx) return;
  await runMatchingAutomations(ctx).catch((e: unknown) =>
    console.error("[trigger-dispatcher] dispatchStatusChanged:", e)
  );
}

export async function dispatchTagAdded(opts: {
  userId:         string;
  contactId:      string;
  conversationId: string | null;
  tag:            string;
}): Promise<void> {
  if (!opts.conversationId) return;
  const ctx = await buildCtxForConversation(
    opts.userId,
    opts.conversationId,
    "tag_added",
    { variables: { "trigger.tag": opts.tag } }
  );
  if (!ctx) return;
  await runMatchingAutomations(ctx).catch((e: unknown) =>
    console.error("[trigger-dispatcher] dispatchTagAdded:", e)
  );
}

export async function dispatchTagRemoved(opts: {
  userId:         string;
  contactId:      string;
  conversationId: string | null;
  tag:            string;
}): Promise<void> {
  if (!opts.conversationId) return;
  const ctx = await buildCtxForConversation(
    opts.userId,
    opts.conversationId,
    "tag_removed",
    { variables: { "trigger.tag": opts.tag } }
  );
  if (!ctx) return;
  await runMatchingAutomations(ctx).catch((e: unknown) =>
    console.error("[trigger-dispatcher] dispatchTagRemoved:", e)
  );
}

export async function dispatchContactCreated(opts: {
  userId:    string;
  contactId: string;
  phone:     string;
  name:      string;
}): Promise<void> {
  const db = createAdminClient();
  const creds = await resolveInstanceCredentials(opts.userId);

  const { data: conv } = await db
    .from("conversations")
    .select("id")
    .eq("user_id", opts.userId)
    .eq("contact_id", opts.contactId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const ctx: ExecutionContext = {
    executionId:    "",
    automationId:   "",
    userId:         opts.userId,
    conversationId: conv?.id ?? null,
    contactId:      opts.contactId,
    phone:          opts.phone,
    instanceName:   creds.instanceName,
    serverUrl:      creds.serverUrl,
    instanceApiKey: creds.apiKey,
    incomingText:   "",
    isFirstMessage: false,
    triggerType:    "contact_created",
    variables:      { "contact.name": opts.name, "contact.phone": opts.phone },
  };

  await runMatchingAutomations(ctx).catch((e: unknown) =>
    console.error("[trigger-dispatcher] dispatchContactCreated:", e)
  );
}

export async function dispatchLeadScoreThreshold(opts: {
  userId:         string;
  contactId:      string;
  conversationId: string | null;
  score:          number;
}): Promise<void> {
  if (!opts.conversationId) return;
  const ctx = await buildCtxForConversation(
    opts.userId,
    opts.conversationId,
    "lead_score_threshold",
    {
      variables: {
        "contact.lead_score":  opts.score,
        "trigger.score":       opts.score,
      },
    }
  );
  if (!ctx) return;
  await runMatchingAutomations(ctx).catch((e: unknown) =>
    console.error("[trigger-dispatcher] dispatchLeadScoreThreshold:", e)
  );
}

export async function dispatchConversationCreated(opts: {
  userId:         string;
  conversationId: string;
  phone:          string;
  incomingText:   string;
}): Promise<void> {
  const ctx = await buildCtxForConversation(
    opts.userId,
    opts.conversationId,
    "conversation_created",
    { incomingText: opts.incomingText }
  );
  if (!ctx) return;
  await runMatchingAutomations(ctx).catch((e: unknown) =>
    console.error("[trigger-dispatcher] dispatchConversationCreated:", e)
  );
}

export async function dispatchNoResponseTimeout(opts: {
  userId:         string;
  conversationId: string;
  waitedMinutes:  number;
}): Promise<void> {
  const ctx = await buildCtxForConversation(
    opts.userId,
    opts.conversationId,
    "no_response_timeout",
    { variables: { "trigger.waited_minutes": opts.waitedMinutes } }
  );
  if (!ctx) return;
  await runMatchingAutomations(ctx).catch((e: unknown) =>
    console.error("[trigger-dispatcher] dispatchNoResponseTimeout:", e)
  );
}

export async function dispatchWebhookLead(opts: {
  userId:      string;
  contactId:   string;
  phone:       string;
  source:      string;
  event:       string;
  contactName: string;
  customData:  Record<string, unknown>;
}): Promise<void> {
  const db    = createAdminClient();
  const creds = await resolveInstanceCredentials(opts.userId);

  // Load the contact so workflows can personalize with email + custom fields
  // ({{contact.email}}, {{contact.goal}}, ...) and condition on them.
  const { data: contact } = await db
    .from("contacts")
    .select("email, custom_fields")
    .eq("id", opts.contactId)
    .maybeSingle();

  const contactVars: Record<string, string | number | boolean> = {
    "contact.email": contact?.email ?? "",
  };
  const customFields = (contact?.custom_fields ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(customFields)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      contactVars[`contact.${key}`] = value;
    }
  }

  // Reuse the contact's latest conversation when one exists so actions like
  // send_message / update_status / notes have a target.
  const { data: conv } = await db
    .from("conversations")
    .select("id")
    .eq("user_id", opts.userId)
    .eq("contact_id", opts.contactId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let conversationId = conv?.id ?? null;

  // No conversation yet and the lead is reachable by phone → open one.
  // Same shape the inbound message pipeline creates, so when the lead
  // replies on WhatsApp the message lands in this same conversation
  // (the pipeline matches by user_id + status + channel + contact_phone).
  if (!conversationId && opts.phone) {
    const { data: created, error: convErr } = await db
      .from("conversations")
      .insert({
        user_id:       opts.userId,
        contact_id:    opts.contactId,
        contact_name:  opts.contactName || opts.phone,
        contact_phone: opts.phone,
        status:        "open",
        channel:       "whatsapp",
        tags:          [],
        unread_count:  0,
      })
      .select("id")
      .single();

    if (convErr) {
      console.error("[trigger-dispatcher] Could not create conversation for lead:", convErr.message);
    } else {
      conversationId = created.id;
    }
  }

  // Flatten custom_data into engine variables: webhook.data.<key>
  const dataVars: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(opts.customData ?? {})) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      dataVars[`webhook.data.${key}`] = value;
    } else if (value !== null && value !== undefined) {
      dataVars[`webhook.data.${key}`] = JSON.stringify(value);
    }
  }

  const ctx: ExecutionContext = {
    executionId:    "",
    automationId:   "",
    userId:         opts.userId,
    conversationId,
    contactId:      opts.contactId,
    phone:          opts.phone,
    instanceName:   creds.instanceName,
    serverUrl:      creds.serverUrl,
    instanceApiKey: creds.apiKey,
    incomingText:   "",
    isFirstMessage: false,
    triggerType:    "webhook_lead",
    variables: {
      "webhook.source": opts.source,
      "webhook.event":  opts.event,
      "contact.name":   opts.contactName,
      "contact.phone":  opts.phone,
      ...contactVars,
      ...dataVars,
    },
  };

  await runMatchingAutomations(ctx).catch((e: unknown) =>
    console.error("[trigger-dispatcher] dispatchWebhookLead:", e)
  );
}

export async function dispatchScheduledCron(opts: {
  userId:       string;
  automationId: string;
}): Promise<void> {
  const creds = await resolveInstanceCredentials(opts.userId);

  const ctx: ExecutionContext = {
    executionId:    "",
    automationId:   opts.automationId,
    userId:         opts.userId,
    conversationId: null,
    contactId:      null,
    phone:          "",
    instanceName:   creds.instanceName,
    serverUrl:      creds.serverUrl,
    instanceApiKey: creds.apiKey,
    incomingText:   "",
    isFirstMessage: false,
    triggerType:    "scheduled_cron",
    variables:      { "trigger.timestamp": new Date().toISOString() },
  };

  await runMatchingAutomations(ctx).catch((e: unknown) =>
    console.error("[trigger-dispatcher] dispatchScheduledCron:", e)
  );
}
