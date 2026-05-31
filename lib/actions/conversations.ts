"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapDbConversation, mapDbMessage } from "@/lib/conversations-mapper";
import { enqueueOutbound, enqueueIGOutbound, enqueueFBOutbound } from "@/lib/queue/producers";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { isWithinQuota, incrementUsage } from "@/lib/billing/usage";
import type { Conversation, Message, ConversationStatus, MessagePage } from "@/types";

// ─── Result union ─────────────────────────────────────────────────────────────

type Ok<T> = { data: T; error: null };
type Err = { data: null; error: string };
type Result<T> = Ok<T> | Err;

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getConversations(): Promise<Result<Conversation[]>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []).map(mapDbConversation), error: null };
}

export async function getMessages(
  conversationId: string
): Promise<Result<Message[]>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []).map(mapDbMessage), error: null };
}

/**
 * Cursor-based message pagination for infinite scroll.
 * Pass cursor = null for the first page (newest messages).
 * Each page returns messages sorted ASC (oldest → newest) for display.
 */
export async function getMessagesPage(
  conversationId: string,
  cursor: string | null,
  limit = 30
): Promise<Result<MessagePage>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  // Fetch one extra to determine hasMore without a COUNT query
  const fetchLimit = limit + 1;

  let query = supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(fetchLimit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  // Reverse so messages render oldest-first inside the page
  const messages = [...pageRows].reverse().map(mapDbMessage);
  const nextCursor = hasMore ? pageRows[pageRows.length - 1].created_at : null;

  return { data: { messages, nextCursor, hasMore }, error: null };
}

/**
 * Full-text search over conversations using the generated tsvector column.
 * Falls back to ilike on contact_name / contact_phone for short queries.
 */
export async function searchConversations(
  query: string
): Promise<Result<Conversation[]>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  const trimmed = query.trim();
  if (!trimmed) return getConversations();

  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", user.id)
    .textSearch("fts", trimmed, { type: "websearch", config: "simple" })
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []).map(mapDbConversation), error: null };
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function sendMessage(
  conversationId: string,
  content: string,
  agentName?: string
): Promise<Result<Message>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  const trimmed = content.trim();
  if (!trimmed) return { data: null, error: "El mensaje no puede estar vacío" };

  // ── Message quota check ────────────────────────────────────────────────────
  const workspaceId = await getUserPrimaryWorkspace(user.id);
  if (workspaceId) {
    const withinQuota = await isWithinQuota(workspaceId, "messages");
    if (!withinQuota) {
      return { data: null, error: "Límite de mensajes mensuales alcanzado. Actualiza tu plan para continuar enviando." };
    }
  }

  // Write the optimistic message row so the UI gets an immediate realtime event
  const { data: msg, error: msgErr } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      content: trimmed,
      type: "text",
      sender: "agent",
      status: "sent",
      agent_name: agentName ?? null,
    })
    .select()
    .single();

  if (msgErr) return { data: null, error: msgErr.message };

  // Meter the outbound message (fire-and-forget — never blocks the send path)
  if (workspaceId) void incrementUsage(workspaceId, "messages_sent");

  // Denormalize preview so the conversation list updates via realtime UPDATE
  await supabase
    .from("conversations")
    .update({
      last_message_preview: trimmed.substring(0, 120),
      last_message_at: msg.created_at,
      last_message_sender: "agent",
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .eq("user_id", user.id);

  // Fire the channel-specific outbound send through the queue (non-blocking)
  void (async () => {
    try {
      const admin = createAdminClient();
      const { data: conv } = await admin
        .from("conversations")
        .select("channel, instance_id, contact_phone")
        .eq("id", conversationId)
        .single();

      if (!conv?.contact_phone) return;

      // ── Instagram DM ──────────────────────────────────────────────────────
      if (conv.channel === "instagram") {
        const { data: thread } = await admin
          .from("instagram_threads")
          .select("account_id")
          .eq("conversation_id", conversationId)
          .maybeSingle();

        if (!thread?.account_id) return;

        await enqueueIGOutbound({
          accountId:      thread.account_id,
          userId:         user.id,
          recipientIgId:  conv.contact_phone,
          content:        trimmed,
          conversationId,
          messageId:      msg.id,
          origin:         "manual",
        });
        return;
      }

      // ── Facebook Messenger ────────────────────────────────────────────────
      // PLAN-1 (GAP-1 fix): resolve the correct page_id for this PSID.
      // PSIDs are page-scoped in Meta — a given PSID only belongs to one page.
      // We use messenger_webhook_events to look up which of this user's pages
      // previously received a message from this PSID, then verify the page is
      // still active. Falls back to the most recently connected page if no
      // inbound history exists (single-page users, first outbound before any inbound).
      if (conv.channel === "messenger") {
        const psid = conv.contact_phone;

        const pageId = await resolveFbPageForPsid(admin, psid, user.id);
        if (!pageId) return;

        await enqueueFBOutbound({
          pageId,
          userId:         user.id,
          recipientPsid:  psid,
          content:        trimmed,
          conversationId,
          messageId:      msg.id,
          origin:         "manual",
        });
        return;
      }

      // ── WhatsApp (default) ────────────────────────────────────────────────
      // Resolve the instance: prefer instance_id stored on the conversation,
      // fall back to the user's first connected instance for conversations
      // created before instance_id was stored (back-compat).
      let instanceRowId = conv.instance_id;
      if (!instanceRowId) {
        const { data: fallback } = await admin
          .from("whatsapp_instances")
          .select("id")
          .eq("user_id", user.id)
          .eq("connection_state", "open")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        instanceRowId = fallback?.id ?? null;
      }
      if (!instanceRowId) return;

      const { data: inst } = await admin
        .from("whatsapp_instances")
        .select("instance_name, server_url, api_key")
        .eq("id", instanceRowId)
        .single();

      if (!inst?.instance_name || !inst.server_url || !inst.api_key) return;

      await enqueueOutbound({
        instanceName: inst.instance_name,
        serverUrl:    inst.server_url,
        apiKey:       inst.api_key,
        phone:        conv.contact_phone,
        content:      trimmed,
        type:         "text",
        conversationId,
        userId:       user.id,
        origin:       "manual",
        agentName:    agentName ?? undefined,
        messageId:    msg.id,
      });
    } catch {
      // Non-fatal — message is already in DB; the operator can retry manually
    }
  })();

  revalidatePath("/conversations");
  return { data: mapDbMessage(msg), error: null };
}

export async function assignConversation(
  conversationId: string,
  agentId: string | null
): Promise<Result<void>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  const { error } = await supabase
    .from("conversations")
    .update({ assigned_to: agentId, updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("user_id", user.id);

  if (error) return { data: null, error: error.message };
  revalidatePath("/conversations");
  return { data: undefined, error: null };
}

export async function retryFailedMessage(
  messageId: string,
  conversationId: string
): Promise<Result<void>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  // Verify the message belongs to this user's conversation
  const { data: msg, error: msgErr } = await supabase
    .from("messages")
    .select("content, agent_name, conversation_id")
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .single();

  if (msgErr || !msg) return { data: null, error: "Mensaje no encontrado" };

  // Reset status to sent (optimistic)
  await supabase
    .from("messages")
    .update({ status: "sent" })
    .eq("id", messageId);

  // Re-enqueue via the outbound queue with instance credentials
  try {
    const admin = createAdminClient();
    const { data: conv } = await admin
      .from("conversations")
      .select("instance_id, contact_phone")
      .eq("id", conversationId)
      .single();

    if (!conv?.instance_id || !conv.contact_phone) {
      return { data: null, error: "Instancia no configurada para esta conversación" };
    }

    const { data: inst } = await admin
      .from("whatsapp_instances")
      .select("instance_name, server_url, api_key")
      .eq("id", conv.instance_id)
      .single();

    if (!inst?.instance_name || !inst.server_url || !inst.api_key) {
      return { data: null, error: "Credenciales de instancia no encontradas" };
    }

    await enqueueOutbound({
      instanceName: inst.instance_name,
      serverUrl: inst.server_url,
      apiKey: inst.api_key,
      phone: conv.contact_phone,
      content: msg.content,
      type: "text",
      conversationId,
      userId: user.id,
      origin: "manual",
      agentName: msg.agent_name ?? undefined,
      messageId,
    });
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "Error al reencolar" };
  }

  return { data: undefined, error: null };
}

export async function createConversation(payload: {
  contactId?: string;
  contactName: string;
  contactPhone?: string;
  channel?: "whatsapp" | "email" | "sms";
  tags?: string[];
}): Promise<Result<Conversation>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  if (!payload.contactName.trim()) {
    return { data: null, error: "El nombre del contacto es obligatorio" };
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: user.id,
      contact_id: payload.contactId ?? null,
      contact_name: payload.contactName.trim(),
      contact_phone: payload.contactPhone?.trim() ?? null,
      channel: payload.channel ?? "whatsapp",
      tags: payload.tags ?? [],
      status: "open",
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/conversations");
  return { data: mapDbConversation(data), error: null };
}

export async function updateConversationStatus(
  id: string,
  status: ConversationStatus
): Promise<Result<void>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  const { error } = await supabase
    .from("conversations")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { data: null, error: error.message };
  revalidatePath("/conversations");
  return { data: undefined, error: null };
}

export async function markConversationRead(id: string): Promise<Result<void>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  const { error } = await supabase
    .from("conversations")
    .update({ unread_count: 0 })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { data: null, error: error.message };
  return { data: undefined, error: null };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * PLAN-1 (GAP-1): Resolve the correct facebook_pages.page_id for a given PSID.
 *
 * Meta PSIDs (Page-Scoped IDs) are deterministic: a given PSID only exists for
 * exactly one Facebook page. Sending from the wrong page returns a Meta error.
 *
 * Resolution strategy (two steps):
 *
 *   Step 1 — History-based lookup (deterministic, O(1) JSONB index scan):
 *     Query messenger_webhook_events for the most recent event where
 *     raw_payload->>'sender_id' = psid. This was written by the inbound
 *     processor (processMessengerMessage) for every received message since
 *     PLAN-1 was deployed. Verify the page is still active for this user.
 *
 *   Step 2 — Fallback (backward-compatible):
 *     If no history exists (conversations predating this fix, or a first-outbound
 *     scenario), return the most recently connected active page for this user.
 *     For single-page users this is always correct. For multi-page users with
 *     no inbound history it degrades gracefully to pre-fix behavior.
 *
 * Not exported — used only by sendMessage() above.
 */
async function resolveFbPageForPsid(
  db:     AdminClient,
  psid:   string,
  userId: string,
): Promise<string | null> {
  // ── Step 1: history-based lookup ──────────────────────────────────────────
  // raw_payload JSONB @> operator: checks if the column contains the object.
  // messenger_webhook_events.raw_payload is indexed as JSONB (GIN index via Postgres).
  // Only "message" type events carry a sender_id; other types (read, delivery) don't.
  const { data: event } = await db
    .from("messenger_webhook_events")
    .select("page_id")
    .eq("event_type", "message")
    .contains("raw_payload", { sender_id: psid })
    .order("processed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (event?.page_id) {
    // Verify the page is still active and belongs to this user.
    // Guards against: page disconnected after the inbound event was stored.
    const { data: activePage } = await db
      .from("facebook_pages")
      .select("page_id")
      .eq("page_id",   event.page_id)
      .eq("user_id",   userId)
      .eq("is_active", true)
      .maybeSingle();

    if (activePage?.page_id) return activePage.page_id;
    // Page no longer active — fall through to Step 2
  }

  // ── Step 2: fallback (most recently connected active page) ────────────────
  // Explicit ORDER BY connected_at DESC replaces the old unordered maybeSingle().
  // For single-page users the result is identical to the previous behavior.
  const { data: fallback } = await db
    .from("facebook_pages")
    .select("page_id")
    .eq("user_id",   userId)
    .eq("is_active", true)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return fallback?.page_id ?? null;
}
