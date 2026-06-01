// Inbound message processor — the core of the WhatsApp engine.
//
// For each MessageJob it:
//   1. Guards: skips own messages, groups, broadcasts
//   2. Resolves user_id from whatsapp_instances
//   3. Upserts WhatsApp contact (whatsapp_contacts)
//   4. Upserts WhatsApp chat thread (whatsapp_chats)
//   5. Inserts WhatsApp message (whatsapp_messages)
//   6. Mirrors to CRM layer: contacts + conversations + messages
//   7. Enqueues MediaJob if message contains media
//   8. Emits "message:stored" → triggers automation queue

import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueMedia, enqueueAutomation } from "@/lib/queue/producers";
import { eventBus } from "@/lib/event-bus";
import type { MessageJob, MessageJobResult } from "@/lib/queue/types";
import type {
  EvolutionMessageData,
  EvolutionMessageContent,
  EvolutionMessageType,
} from "@/types/evolution";

// ─── Types ────────────────────────────────────────────────────────────────────

type DB = ReturnType<typeof createAdminClient>;

const MEDIA_TYPES = new Set<EvolutionMessageType>([
  "imageMessage",
  "videoMessage",
  "audioMessage",
  "documentMessage",
  "stickerMessage",
]);

type WppMessageType = "text" | "image" | "video" | "audio" | "document" | "sticker" | "location" | "contact" | "reaction" | "poll" | "template" | "ptv" | "unknown";

const MESSAGE_TYPE_MAP: Partial<Record<EvolutionMessageType, WppMessageType>> = {
  conversation:          "text",
  extendedTextMessage:   "text",
  imageMessage:          "image",
  videoMessage:          "video",
  audioMessage:          "audio",
  documentMessage:       "document",
  stickerMessage:        "sticker",
  locationMessage:       "location",
  contactMessage:        "contact",
  reactionMessage:       "reaction",
  pollCreationMessage:   "poll",
};

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function processMessage(
  job: MessageJob
): Promise<MessageJobResult> {
  const { instanceName, data, traceId } = job;

  // ── Guards ───────────────────────────────────────────────────────────────
  if (!data.key) {
    return skip("missing key");
  }

  const { remoteJid, fromMe, id: externalId } = data.key;

  if (!remoteJid) return skip("empty remoteJid");
  if (shouldSkipJid(remoteJid)) return skip(`group/broadcast JID: ${remoteJid}`);

  const canonicalInstance = process.env.EVOLUTION_INSTANCE_NAME ?? "";
  if (canonicalInstance && instanceName !== canonicalInstance) {
    console.warn("[INSTANCE_CHECK] mismatch in worker — dropping", {
      expected: canonicalInstance,
      received: instanceName,
    });
    return skip(`instance mismatch: expected ${canonicalInstance}, got ${instanceName}`);
  }
  console.log("[INSTANCE_CHECK] ok", { expected: canonicalInstance || "(any)", received: instanceName });

  console.log("[TRACE_C] job processing", {
    traceId,
    msgId:    externalId,
    fromMe,
    instance: instanceName,
    jid:      remoteJid,
  });

  const phone = normalizePhone(remoteJid);

  // ── Resolve CRM user ─────────────────────────────────────────────────────
  const supabase = createAdminClient();
  const config   = await resolveInstance(supabase, instanceName);

  if (!config) {
    console.error(`[msg-processor] No instance record for "${instanceName}" — dropping`);
    return { contactId: null, conversationId: null, isFirstMessage: false, skipped: true, skipReason: "instance not found" };
  }

  const content   = extractText(data.message ?? {});
  const msgType   = MESSAGE_TYPE_MAP[data.messageType ?? "conversation"] ?? "text";
  const timestamp = data.messageTimestamp
    ? new Date(data.messageTimestamp * 1_000).toISOString()
    : new Date().toISOString();

  // ── WhatsApp native layer (inbound only) ──────────────────────────────────
  // Skipped for fromMe=true: data.pushName is the agent's own WhatsApp name —
  // passing it through would overwrite the contact's stored name.
  if (!fromMe) {
    const contactName  = resolveContactName(data, phone);
    const wppContactId = await upsertWhatsAppContact(supabase, config, remoteJid, phone, data);
    const wppChatId    = await upsertWhatsAppChat(supabase, config, remoteJid, contactName, wppContactId, content, timestamp);

    if (wppChatId) {
      const wppMessageId = await insertWhatsAppMessage(
        supabase, config, wppChatId, data, externalId ?? `ev-${Date.now()}`,
        remoteJid, content, msgType, timestamp
      );

      if (wppMessageId && data.messageType && MEDIA_TYPES.has(data.messageType)) {
        await enqueueMedia({
          messageId:    wppMessageId,
          externalId:   externalId ?? "",
          instanceName,
          userId:       config.userId,
          chatId:       wppChatId,
          mediaType:    msgType as "image" | "audio" | "video" | "document" | "sticker",
          mimeType:     extractMimeType(data.message),
          fileName:     extractFileName(data.message),
        }).catch((err) => console.warn("[msg-processor] enqueueMedia failed:", err));
      }
    }
  }

  // ── CRM layer ─────────────────────────────────────────────────────────────
  // For fromMe=true, use phone as contact name placeholder so we never
  // overwrite an existing contact's real name with the agent's push name.
  const crmContactName = fromMe ? phone : resolveContactName(data, phone);
  const crmContactId   = await upsertCrmContact(supabase, config.userId, phone, crmContactName);
  const crmConv        = await upsertCrmConversation(supabase, config.userId, config.instanceId, crmContactId, crmContactName, phone);

  if (!crmConv) {
    console.error("[msg-processor] Failed to upsert CRM conversation — dropping");
    return { contactId: crmContactId, conversationId: null, isFirstMessage: false, skipped: true, skipReason: "conversation upsert failed" };
  }

  await storeCrmMessage(supabase, crmConv.id, content, msgType, timestamp, externalId ?? `ev-${Date.now()}`, fromMe ?? false);

  console.log("[TRACE_D] message stored", {
    traceId,
    msgId:          externalId,
    conversationId: crmConv.id,
    contactId:      crmContactId,
    fromMe,
  });

  // Automations and event bus only fire for inbound contact messages.
  if (!fromMe) {
    // ── Automation trigger ───────────────────────────────────────────────────
    // IMPORTANT: wrapped in .catch() — if the producer Redis is temporarily
    // unavailable, throwing here would cause BullMQ to retry the entire job.
    // Each retry re-runs storeCrmMessage and inserts duplicate message rows
    // (no UNIQUE constraint on external_id). The automation is non-critical
    // compared to the integrity of public.messages.
    await enqueueAutomation({
      userId:         config.userId,
      conversationId: crmConv.id,
      contactId:      crmContactId,
      phone,
      incomingText:   content,
      isFirstMessage: crmConv.isNew,
      instanceName,
      serverUrl:      config.serverUrl,
      instanceApiKey: config.apiKey,
      triggerType:    crmConv.isNew ? "first_message" : "message_received",
    }).catch((err: unknown) => {
      console.warn("[msg-processor] enqueueAutomation failed (non-critical):",
        err instanceof Error ? err.message : String(err));
    });

    if (crmConv.isNew) {
      await enqueueAutomation({
        userId:         config.userId,
        conversationId: crmConv.id,
        contactId:      crmContactId,
        phone,
        incomingText:   content,
        isFirstMessage: true,
        instanceName,
        serverUrl:      config.serverUrl,
        instanceApiKey: config.apiKey,
        triggerType:    "conversation_created",
      }).catch(() => { /* non-critical */ });
    }

    eventBus.emit("message:stored", {
      instanceName,
      userId:         config.userId,
      conversationId: crmConv.id,
      contactId:      crmContactId,
      phone,
      incomingText:   content,
      isFirstMessage: crmConv.isNew,
      serverUrl:      config.serverUrl,
      instanceApiKey: config.apiKey,
    });
  }

  console.info(
    `[msg-processor] OK — instance=${instanceName} phone=${phone} fromMe=${fromMe}` +
    ` conv=${crmConv.id} first=${crmConv.isNew}`
  );

  return {
    contactId:      crmContactId,
    conversationId: crmConv.id,
    isFirstMessage: crmConv.isNew,
    skipped:        false,
  };
}

// ─── Guards ───────────────────────────────────────────────────────────────────

function skip(reason: string): MessageJobResult {
  console.info(`[msg-processor] skip — ${reason}`);
  return { contactId: null, conversationId: null, isFirstMessage: false, skipped: true, skipReason: reason };
}

function shouldSkipJid(jid: string): boolean {
  return jid.endsWith("@g.us") || jid.endsWith("@broadcast") || jid === "status@broadcast";
}

function normalizePhone(remoteJid: string): string {
  return remoteJid.split("@")[0].replace(/\D/g, "");
}

// ─── Content extraction ───────────────────────────────────────────────────────

function resolveContactName(data: EvolutionMessageData, phone: string): string {
  return (
    data.pushName?.trim() ||
    data.notifyName?.trim() ||
    data.verifiedBizName?.trim() ||
    phone
  );
}

function extractText(message: EvolutionMessageContent): string {
  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    message.documentMessage?.title ??
    message.documentMessage?.fileName ??
    message.locationMessage?.name ??
    message.contactMessage?.displayName ??
    "[Mídia]"
  );
}

function extractMimeType(message: EvolutionMessageContent | undefined): string | undefined {
  if (!message) return undefined;
  return (
    message.imageMessage?.mimetype ??
    message.videoMessage?.mimetype ??
    message.audioMessage?.mimetype ??
    message.documentMessage?.mimetype ??
    message.stickerMessage?.mimetype
  );
}

function extractFileName(message: EvolutionMessageContent | undefined): string | undefined {
  if (!message) return undefined;
  return message.documentMessage?.fileName ?? message.documentMessage?.title;
}

// ─── Instance resolution ──────────────────────────────────────────────────────

interface InstanceConfig {
  userId: string;
  instanceId: string;
  instanceName: string;
  serverUrl: string;
  apiKey: string;
}

async function resolveInstance(
  db: DB,
  instanceName: string
): Promise<InstanceConfig | null> {
  const { data, error } = await db
    .from("whatsapp_instances")
    .select("id, user_id, instance_name, server_url, api_key")
    .eq("instance_name", instanceName)
    .maybeSingle();

  if (error) {
    console.warn("[msg-processor] resolveInstance DB error — will use env fallback", {
      instanceName,
      error: error.message,
    });
  }

  if (data) {
    return {
      userId:       data.user_id,
      instanceId:   data.id,
      instanceName: data.instance_name,
      serverUrl:    data.server_url,
      apiKey:       data.api_key,
    };
  }

  // Fallback for dev environments or when DB query fails
  const fallbackUserId = process.env.EVOLUTION_FALLBACK_USER_ID?.trim();
  if (fallbackUserId) {
    console.info("[msg-processor] resolveInstance using env fallback", { instanceName, fallbackUserId });
    return {
      userId:       fallbackUserId,
      instanceId:   "",
      instanceName,
      serverUrl:    process.env.EVOLUTION_SERVER_URL ?? "",
      apiKey:       process.env.EVOLUTION_API_KEY ?? "",
    };
  }

  return null;
}

// ─── WhatsApp native layer ────────────────────────────────────────────────────

async function upsertWhatsAppContact(
  db: DB,
  config: InstanceConfig,
  whatsappId: string,
  phone: string,
  data: EvolutionMessageData
): Promise<string | null> {
  if (!config.instanceId) return null;

  const { data: existing } = await db
    .from("whatsapp_contacts")
    .select("id, push_name")
    .eq("instance_id", config.instanceId)
    .eq("whatsapp_id", whatsappId)
    .maybeSingle();

  if (existing) {
    // Update name if we got a better one
    const newName = data.pushName?.trim() ?? data.notifyName?.trim() ?? null;
    if (newName && newName !== existing.push_name) {
      await db
        .from("whatsapp_contacts")
        .update({ push_name: newName, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: created } = await db
    .from("whatsapp_contacts")
    .insert({
      user_id:     config.userId,
      instance_id: config.instanceId,
      whatsapp_id: whatsappId,
      phone,
      push_name:   data.pushName?.trim() ?? null,
      business_name: data.verifiedBizName?.trim() ?? null,
    })
    .select("id")
    .single();

  return created?.id ?? null;
}

async function upsertWhatsAppChat(
  db: DB,
  config: InstanceConfig,
  remoteJid: string,
  name: string,
  contactId: string | null,
  lastPreview: string,
  lastAt: string
): Promise<string | null> {
  if (!config.instanceId) return null;

  const { data: existing } = await db
    .from("whatsapp_chats")
    .select("id, unread_count")
    .eq("instance_id", config.instanceId)
    .eq("remote_jid", remoteJid)
    .maybeSingle();

  if (existing) {
    await db
      .from("whatsapp_chats")
      .update({
        last_message_at:      lastAt,
        last_message_preview: lastPreview.slice(0, 120),
        last_message_sender:  "them",
        unread_count:         (existing.unread_count ?? 0) + 1,
        updated_at:           new Date().toISOString(),
      })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data: created } = await db
    .from("whatsapp_chats")
    .insert({
      user_id:              config.userId,
      instance_id:          config.instanceId,
      whatsapp_contact_id:  contactId,
      remote_jid:           remoteJid,
      name,
      is_group:             false,
      unread_count:         1,
      last_message_at:      lastAt,
      last_message_preview: lastPreview.slice(0, 120),
      last_message_sender:  "them",
    })
    .select("id")
    .single();

  return created?.id ?? null;
}

async function insertWhatsAppMessage(
  db: DB,
  config: InstanceConfig,
  chatId: string,
  data: EvolutionMessageData,
  externalId: string,
  remoteJid: string,
  content: string,
  type: WppMessageType,
  timestamp: string
): Promise<string | null> {
  // Deduplicate by external_id
  const { data: existing } = await db
    .from("whatsapp_messages")
    .select("id")
    .eq("external_id", externalId)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await db
    .from("whatsapp_messages")
    .insert({
      user_id:     config.userId,
      instance_id: config.instanceId,
      chat_id:     chatId,
      external_id: externalId,
      remote_jid:  remoteJid,
      push_name:   data.pushName ?? null,
      from_me:     false,
      type,
      content,
      raw_content: data.message as unknown as import("@/types/supabase").Json,
      status:      "received",
      timestamp,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[msg-processor] whatsapp_messages insert error:", error.message);
    return null;
  }

  return created.id;
}

// ─── CRM layer ────────────────────────────────────────────────────────────────

async function upsertCrmContact(
  db: DB,
  userId: string,
  phone: string,
  displayName: string
): Promise<string | null> {
  const { data: existing } = await db
    .from("contacts")
    .select("id, name")
    .eq("user_id", userId)
    .or(`phone.eq.${phone},whatsapp.eq.${phone}`)
    .maybeSingle();

  if (existing) {
    const needsPatch =
      displayName && displayName !== phone &&
      (!existing.name || existing.name === phone);
    if (needsPatch) {
      await db
        .from("contacts")
        .update({ name: displayName, last_interaction: new Date().toISOString() })
        .eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: created, error: insertError } = await db
    .from("contacts")
    .insert({
      user_id: userId,
      name:    displayName || phone,
      phone,
      whatsapp: phone,
      status: "active" as const,
      tags: [] as string[],
      last_interaction: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError) {
    // Unique violation: concurrent job already inserted — re-query the winner
    if (insertError.code === "23505" || insertError.message.includes("duplicate")) {
      const { data: winner } = await db
        .from("contacts")
        .select("id")
        .eq("user_id", userId)
        .or(`phone.eq.${phone},whatsapp.eq.${phone}`)
        .maybeSingle();
      return winner?.id ?? null;
    }
    console.error("[msg-processor] contacts insert error:", insertError.message);
  }

  return created?.id ?? null;
}

async function upsertCrmConversation(
  db: DB,
  userId: string,
  instanceId: string,
  contactId: string | null,
  contactName: string,
  contactPhone: string
): Promise<{ id: string; isNew: boolean } | null> {
  // If instanceId wasn't resolved (worker fell back to env var path), look it up now.
  // This makes the conversation creation resilient to resolveInstance() fallback.
  let effectiveInstanceId = instanceId || null;
  if (!effectiveInstanceId) {
    const { data: inst } = await db
      .from("whatsapp_instances")
      .select("id")
      .eq("user_id", userId)
      .eq("connection_state", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    effectiveInstanceId = inst?.id ?? null;
    if (effectiveInstanceId) {
      console.info("[msg-processor] resolved instance_id from open instance fallback", { userId, effectiveInstanceId });
    }
  }

  const { data: existing } = await db
    .from("conversations")
    .select("id, contact_name, instance_id")
    .eq("user_id", userId)
    .eq("status", "open")
    .eq("channel", "whatsapp")
    .eq("contact_phone", contactPhone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const updates: Record<string, unknown> = {};
    const hasRealName   = contactName && contactName !== contactPhone;
    const isPlaceholder = !existing.contact_name || existing.contact_name === contactPhone;
    const needsInstanceId = effectiveInstanceId && !existing.instance_id;

    if (hasRealName && isPlaceholder) updates.contact_name = contactName;
    if (needsInstanceId) updates.instance_id = effectiveInstanceId;

    if (Object.keys(updates).length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.from("conversations").update(updates as any).eq("id", existing.id);
    }
    return { id: existing.id, isNew: false };
  }

  const { data: created, error } = await db
    .from("conversations")
    .insert({
      user_id:       userId,
      instance_id:   effectiveInstanceId,
      contact_id:    contactId,
      contact_name:  contactName,
      contact_phone: contactPhone,
      status:        "open" as const,
      channel:       "whatsapp" as const,
      tags:          [] as string[],
      unread_count:  0,
    })
    .select("id")
    .single();

  if (error) {
    // Unique violation: concurrent job already created this conversation — re-query the winner
    if (error.code === "23505" || error.message.includes("duplicate")) {
      const { data: winner } = await db
        .from("conversations")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "open")
        .eq("channel", "whatsapp")
        .eq("contact_phone", contactPhone)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (winner) return { id: winner.id, isNew: false };
    }
    console.error("[msg-processor] conversations insert error:", error.message);
    return null;
  }

  return { id: created.id, isNew: true };
}

async function storeCrmMessage(
  db: DB,
  conversationId: string,
  content: string,
  type: string,
  timestamp: string,
  externalId: string,
  isMine: boolean
): Promise<void> {
  const sender: "agent" | "contact" = isMine ? "agent" : "contact";

  // Dedup check for ALL messages (not just fromMe) — prevents duplicate rows
  // on BullMQ retries and concurrent processing of the same external_id.
  const { data: existing } = await db
    .from("messages")
    .select("id")
    .eq("external_id", externalId)
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (existing) {
    console.info(`[msg-processor] dedup — external_id=${externalId} already stored`);
    return;
  }

  const crmType = (["text", "image", "audio", "document"].includes(type) ? type : "document") as
    "text" | "image" | "audio" | "document";

  const { error } = await db
    .from("messages")
    .insert({
      conversation_id: conversationId,
      content,
      type:            crmType,
      sender,
      status:          isMine ? ("sent" as const) : ("delivered" as const),
      external_id:     externalId,
    });

  if (error) {
    // Duplicate: another concurrent path already stored this — safe to skip.
    if (error.code === "23505" || error.message.includes("duplicate")) {
      console.info(`[msg-processor] dedup (DB constraint) — external_id=${externalId}`);
      return; // Skip conversation update — already done by the first writer
    }
    // Real error: throw so BullMQ retries the job instead of silently losing the message.
    console.error("[msg-processor] messages insert FAILED — will retry", {
      externalId,
      conversationId,
      error: error.message,
      code:  error.code,
    });
    throw new Error(`[storeCrmMessage] insert failed: ${error.message}`);
  }

  const now = new Date().toISOString();
  await db
    .from("conversations")
    .update({
      last_message_at:      timestamp,
      last_message_preview: content.slice(0, 120),
      last_message_sender:  sender,
      updated_at:           now,
    })
    .eq("id", conversationId);

  // Only increment unread for inbound contact messages
  if (!isMine) {
    try { await db.rpc("increment_unread", { p_id: conversationId }); } catch { /* non-critical */ }
  }
}
