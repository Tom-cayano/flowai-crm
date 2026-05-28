/**
 * DB-to-app mappers for conversations and messages.
 *
 * This file has NO "use server" / "use client" directive so it can be
 * imported by both Server Components/Actions and Client Components
 * (e.g. conversations-shell.tsx needs it for realtime payload mapping).
 */

import type { Tables } from "@/types/supabase";
import type { Conversation, Message, ConversationStatus } from "@/types";

// ─── Safe cast helpers ────────────────────────────────────────────────────────
// Realtime payloads arrive as untyped JSON; guard every enum field so an
// unexpected DB value never silently propagates into the app.

const VALID_CONV_STATUSES = new Set(["open", "resolved", "pending", "spam"]);
const VALID_CHANNELS = new Set(["whatsapp", "instagram", "messenger", "email", "sms"]);
const VALID_SENDERS = new Set(["agent", "contact"]);

function safeConvStatus(s: unknown): ConversationStatus {
  return VALID_CONV_STATUSES.has(s as string)
    ? (s as ConversationStatus)
    : "open";
}

function safeChannel(s: unknown): "whatsapp" | "instagram" | "messenger" | "email" | "sms" {
  return VALID_CHANNELS.has(s as string)
    ? (s as "whatsapp" | "instagram" | "messenger" | "email" | "sms")
    : "whatsapp";
}

function safeMsgSender(s: unknown): "agent" | "contact" {
  return VALID_SENDERS.has(s as string) ? (s as "agent" | "contact") : "contact";
}

export function mapDbConversation(row: Tables<"conversations">): Conversation {
  return {
    id: row.id,
    contact: {
      // contact_id is null for webhook-created contacts; fall back to conv id
      // so the object always has a non-empty id for React keys.
      id: row.contact_id ?? row.id,
      name: row.contact_name || "Sin nombre",
      phone: row.contact_phone ?? "",
      status: "active",
      tags: [],
      lastSeen: row.updated_at,
      createdAt: row.created_at,
      totalMessages: 0,
    },
    lastMessage: {
      id: `preview-${row.id}`,
      conversationId: row.id,
      content: row.last_message_preview ?? "",
      type: "text",
      sender: safeMsgSender(row.last_message_sender),
      status: "sent",
      timestamp: row.last_message_at ?? row.updated_at,
    },
    // Realtime payloads sometimes deliver numbers as strings; coerce defensively.
    unreadCount: Number(row.unread_count) || 0,
    status: safeConvStatus(row.status),
    assignedTo: row.assigned_to ?? undefined,
    tags: Array.isArray(row.tags) ? row.tags : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    channel: safeChannel(row.channel),
  };
}

export function mapDbMessage(row: Tables<"messages">): Message {
  return {
    id:             row.id,
    conversationId: row.conversation_id,
    content:        row.content,
    type:           row.type as Message["type"],
    sender:         row.sender as "agent" | "contact",
    status:         row.status as Message["status"],
    timestamp:      row.created_at,
    agentName:      row.agent_name ?? undefined,
    mediaUrl:       row.media_url ?? undefined,
    mediaMimeType:  row.media_mime_type ?? undefined,
    thumbnailUrl:   row.thumbnail_url ?? undefined,
    externalId:     row.external_id ?? undefined,
    retryCount:     row.retry_count ?? undefined,
    failedReason:   row.failed_reason ?? undefined,
  };
}

/** Map a raw realtime payload.new (untyped) to a Message. */
export function mapRealtimeMessage(raw: Record<string, unknown>): Message {
  return {
    id:             raw.id as string,
    conversationId: raw.conversation_id as string,
    content:        raw.content as string,
    type:           (raw.type as Message["type"]) ?? "text",
    sender:         raw.sender as "agent" | "contact",
    status:         (raw.status as Message["status"]) ?? "sent",
    timestamp:      raw.created_at as string,
    agentName:      (raw.agent_name as string | null) ?? undefined,
    mediaUrl:       (raw.media_url as string | null) ?? undefined,
    mediaMimeType:  (raw.media_mime_type as string | null) ?? undefined,
    thumbnailUrl:   (raw.thumbnail_url as string | null) ?? undefined,
    externalId:     (raw.external_id as string | null) ?? undefined,
  };
}

/** Map a raw realtime payload.new (untyped) to a Conversation. */
export function mapRealtimeConversation(
  raw: Record<string, unknown>
): Conversation {
  return mapDbConversation(raw as unknown as Tables<"conversations">);
}
