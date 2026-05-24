"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapDbConversation, mapDbMessage } from "@/lib/conversations-mapper";
import { enqueueOutbound } from "@/lib/queue/producers";
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

  // Fire the actual WhatsApp send through the outbound queue (non-blocking)
  void (async () => {
    try {
      // Fetch conversation to get instance_id and contact phone
      const admin = createAdminClient();
      const { data: conv } = await admin
        .from("conversations")
        .select("instance_id, contact_phone")
        .eq("id", conversationId)
        .single();

      if (!conv?.instance_id || !conv.contact_phone) return;

      // Fetch instance credentials (never exposed to browser)
      const { data: inst } = await admin
        .from("whatsapp_instances")
        .select("instance_name, server_url, api_key")
        .eq("id", conv.instance_id)
        .single();

      if (!inst?.instance_name || !inst.server_url || !inst.api_key) return;

      await enqueueOutbound({
        instanceName: inst.instance_name,
        serverUrl: inst.server_url,
        apiKey: inst.api_key,
        phone: conv.contact_phone,
        content: trimmed,
        type: "text",
        conversationId,
        userId: user.id,
        origin: "manual",
        agentName: agentName ?? undefined,
        messageId: msg.id,
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
