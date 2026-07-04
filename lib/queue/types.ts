// All job type definitions for the FlowAI WhatsApp engine.
// Producers live in lib/queue/producers.ts (Next.js compatible).
// Consumers live in workers/processors/ (Node.js process only).

import type {
  EvolutionMessageData,
  EvolutionStatusUpdate,
  EvolutionConnectionUpdate,
} from "@/types/evolution";

// ─── Queue names ──────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  WPP_MESSAGE:    "wpp-message",    // Inbound message pipeline
  WPP_STATUS:     "wpp-status",     // Delivery receipt updates
  WPP_MEDIA:      "wpp-media",      // Media download + Supabase Storage upload
  WPP_AUTOMATION: "wpp-automation", // Automation rule evaluation
  WPP_OUTBOUND:   "wpp-outbound",   // Outbound message sending (rate-limited)
  WPP_CONNECTION: "wpp-connection", // Instance connection-state changes
  WPP_SESSION:    "wpp-session",    // Periodic session health checks
  WPP_SCHEDULED:  "wpp-scheduled",  // Delayed automation step resumption
  WPP_TRIGGER:    "wpp-trigger",    // Non-message trigger events
  WPP_AI:         "wpp-ai",         // AI reply generation + embeddings
  // ─── Instagram ─────────────────────────────────────────────────────────
  IGM_MESSAGE:    "igm-message",    // Inbound Instagram DM pipeline
  IGM_OUTBOUND:   "igm-outbound",   // Outbound DM sending (rate-limited)
  IGM_COMMENT:    "igm-comment",    // Instagram comment event processing
  IGM_MEDIA:      "igm-media",      // Media download from Meta CDN → Storage
  IGM_TOKEN:      "igm-token",      // Long-lived token refresh jobs
  // ─── Facebook Messenger ────────────────────────────────────────────────
  FBM_MESSAGE:    "fbm-message",    // Inbound Messenger message pipeline
  FBM_OUTBOUND:   "fbm-outbound",   // Outbound Messenger message sending
  // ─── WhatsApp Cloud API (direct, not Evolution) ────────────────────────
  WAC_MESSAGE:    "wac-message",    // Inbound Cloud API message pipeline
  WAC_OUTBOUND:   "wac-outbound",   // Outbound Cloud API message sending
  // ─── Universal webhooks (external apps → /api/webhooks/leads) ──────────
  LEAD_WEBHOOK:   "lead-webhook",   // Retry queue for failed lead events
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ─── Job payloads ──────────────────────────────────────────────────────────────

/** Inbound WhatsApp message — dispatched from webhook, processed by worker. */
export interface MessageJob {
  instanceName: string;
  data: EvolutionMessageData;
  receivedAt: string; // ISO timestamp — track end-to-end latency
  traceId?: string;  // Correlates webhook → BullMQ → worker → DB in logs
}

/** Delivery receipt batch — one per messages.update event. */
export interface StatusJob {
  instanceName: string;
  updates: EvolutionStatusUpdate[];
}

/**
 * Media download + upload job.
 * Enqueued by the message processor after the DB row is written.
 */
export interface MediaJob {
  /** whatsapp_messages.id (UUID) — row to update with media_url after upload */
  messageId: string;
  /** WhatsApp message ID — passed to Evolution API /chat/getBase64FromMediaMessage */
  externalId: string;
  instanceName: string;
  userId: string;
  chatId: string;
  mediaType: "image" | "audio" | "video" | "document" | "sticker";
  mimeType?: string;
  fileName?: string;
}

/** Automation rule evaluation — runs after a message is stored. */
export interface AutomationJob {
  userId: string;
  conversationId: string | null;
  contactId: string | null;
  phone: string;
  incomingText: string;
  isFirstMessage: boolean;
  instanceName: string;
  serverUrl: string;
  instanceApiKey: string;
  /** Which trigger type to match against. Defaults to "message_received". */
  triggerType?: string;
  // Instagram-specific context (optional — only set for IG triggers)
  igAccountId?: string;
  igCommentId?: string;
  igMediaId?:   string;
  igUserId?:    string;
  // WhatsApp Cloud API context (optional — only set for WAC triggers)
  wacAccountId?: string;   // whatsapp_cloud_accounts.id (UUID)
  // Facebook Messenger context (optional — only set for Messenger triggers)
  fbmPageId?:    string;   // facebook_pages.page_id
}

/**
 * Non-message trigger events (status change, tag change, cron, timeout, etc.)
 * These are dispatched by processors and server actions — not from the webhook.
 */
export interface TriggerJob {
  type: "status_changed" | "tag_added" | "tag_removed" | "contact_created"
      | "no_response_timeout" | "lead_score_threshold" | "scheduled_cron"
      | "conversation_created" | "webhook_lead";
  userId:         string;
  conversationId: string | null;
  contactId:      string | null;
  phone:          string;
  /** Type-specific metadata (tag name, from/to status, score, cron automation ID, etc.) */
  meta:           Record<string, unknown>;
}

/**
 * Outbound message send — rate-limited, anti-ban delays applied.
 * All sends go through this queue so rate limiting is centralised.
 *
 * When messageId is set the outbound processor skips the INSERT and instead
 * patches the pre-existing DB row with the external_id returned by the API.
 * This avoids duplicates when the UI has already written an optimistic row.
 */
export interface OutboundJob {
  instanceName: string;
  serverUrl: string;
  apiKey: string;
  phone: string;
  content: string;
  type: "text";
  conversationId: string;
  userId: string;
  origin: "automation" | "campaign" | "manual" | "ai_reply";
  agentName?: string;
  /** Pre-written DB message row id — update instead of insert when present. */
  messageId?: string;
}

/** Connection state change — persists to whatsapp_instances + broadcasts. */
export interface ConnectionJob {
  instanceName: string;
  state: EvolutionConnectionUpdate["state"];
  phone?: string;
  displayName?: string;
}

/** Periodic session health check or manual reconnect. */
export interface SessionJob {
  instanceName: string;
  userId: string;
  action: "health_check" | "reconnect" | "sync_state";
}

/**
 * Async AI job — enqueued from the automation engine or directly from the
 * message processor when AI is enabled. The AI processor runs the full
 * orchestration pipeline (RAG → generate → moderate → outbound).
 */
export interface AIJob {
  userId:          string;
  conversationId:  string;
  phone:           string;
  incomingText:    string;
  instanceName:    string;
  serverUrl:       string;
  instanceApiKey:  string;
  promptId?:       string;
  model?:          string;
  maxTokens?:      number;
  temperature?:    number;
  /** Which operations to run beyond reply generation */
  ops?: {
    classify?:     boolean;
    qualify?:      boolean;
    embed?:        boolean;
    followUp?:     boolean;
  };
  correlationId?:  string;
  /**
   * Auto-reply engine mode — when set, the AI processor routes through
   * runAutoReply() instead of (or in addition to) runAIReply().
   *   "suggestion" → suggest only (chips, no draft)
   *   "approval"   → generate draft, await agent approval
   *   "full_auto"  → generate draft, auto-send if confidence ≥ threshold
   */
  autoReplyMode?:    "suggestion" | "approval" | "full_auto";
  /** CRM messages.id that triggered this AI job — stored on the draft for context. */
  triggerMessageId?: string;
  /** Channel this message arrived on — used for channel gate in auto-reply engine. */
  channel?:          string;
}

/** Resume a wait_delay automation workflow node after delay expires. */
export interface ScheduledJob {
  taskId:     string;  // scheduled_tasks.id — used to claim + complete the row
  userId:     string;
}

// ─── Instagram job payloads ───────────────────────────────────────────────────

/**
 * Raw Meta webhook message event.
 * One job per messaging entry (one per DM received).
 */
export interface IGMessageJob {
  accountId:   string;   // instagram_accounts.id (UUID)
  userId:      string;
  workspaceId: string;
  pageId:      string;   // Facebook Page ID that received the event
  senderId:       string;        // Instagram-scoped user ID of the sender
  senderUsername: string | null; // Instagram handle — present in webhook payload when Meta sends it
  recipientId:    string;        // Page's Instagram-scoped ID
  mid:         string;   // Meta message ID — idempotency key
  text:        string | null;
  attachments: Array<{
    type:    string;   // "image" | "video" | "audio" | "file" | "share" | "story_mention"
    payload: { url?: string; sticker_id?: number; title?: string };
  }> | null;
  timestamp:   number;   // unix ms from Meta
  isEcho:      boolean;  // true = sent by the page itself (skip for inbound)
  receivedAt:  string;   // ISO — end-to-end latency tracking
}

/**
 * Outbound Instagram DM — rate-limited to ~250 DMs/hour/page.
 */
export interface IGOutboundJob {
  accountId:      string;
  userId:         string;
  recipientIgId:  string;  // Instagram-scoped user ID of the recipient
  content:        string;
  conversationId: string;
  /** Pre-written CRM messages row — update external_id after send */
  messageId?:     string;
  origin:         "automation" | "manual" | "ai_reply";
}

/**
 * Instagram comment event (post / reel comment or story mention).
 */
export interface IGCommentJob {
  accountId:    string;
  userId:       string;
  workspaceId:  string;
  commentId:    string;   // ig_comment_id — idempotency key
  mediaId:      string;   // ig_media_id the comment is on
  mediaType?:   string;   // "IMAGE" | "VIDEO" | "REEL" | "CAROUSEL_ALBUM"
  fromIgUserId: string;
  fromUsername: string | null;
  text:         string;
  parentCommentId?: string;
  timestamp:    number;
  receivedAt:   string;
}

/**
 * Media download from Meta CDN → Supabase Storage.
 */
export interface IGMediaJob {
  messageId:  string;   // instagram_messages.id (UUID) — row to update
  mid:        string;   // Meta message ID
  accountId:  string;
  userId:     string;
  mediaUrl:   string;   // public Meta CDN URL (expires ~24h)
  mediaType:  "image" | "video" | "audio";
  mimeType?:  string;
}

/**
 * Periodic long-lived token refresh job.
 * Meta long-lived user tokens expire in 60 days and must be refreshed before expiry.
 */
export interface IGTokenJob {
  accountId: string;
  userId:    string;
  action:    "refresh";
}

// ─── Facebook Messenger job payloads ─────────────────────────────────────────

/**
 * Raw Meta webhook messaging event for Facebook Messenger.
 * One job per messaging entry (one per message received).
 */
export interface FBMessageJob {
  pageId:      string;   // Facebook Page ID (entry.id from webhook)
  senderId:    string;   // Messenger Page-Scoped User ID (PSID) of the sender
  recipientId: string;   // Page's own PSID
  mid:         string;   // Meta message ID — idempotency key
  text:        string | null;
  attachments: Array<{
    type:    string;   // "image" | "video" | "audio" | "file" | "template" | "fallback"
    payload: { url?: string; title?: string; sticker_id?: number };
  }> | null;
  timestamp:   number;   // unix ms from Meta
  isEcho:      boolean;  // true = sent by the page itself (skip for inbound)
  receivedAt:  string;   // ISO — end-to-end latency tracking
}

/**
 * Outbound Facebook Messenger message.
 * Processed at low concurrency (rate limits: ~250 msgs/sec per page).
 */
export interface FBOutboundJob {
  pageId:         string;   // Facebook Page ID (for page token lookup)
  userId:         string;
  recipientPsid:  string;   // Messenger PSID to send to
  content:        string;
  conversationId: string;
  /** Pre-written CRM messages row — update external_id after send when present. */
  messageId?:     string;
  origin:         "automation" | "manual" | "ai_reply";
}

// ─── WhatsApp Cloud API job payloads ─────────────────────────────────────────

/**
 * Inbound Cloud API message event.
 * One job per message in the "messages" array of the webhook entry.
 */
export interface WACMessageJob {
  accountId:      string;   // whatsapp_cloud_accounts.id (UUID)
  userId:         string;
  workspaceId:    string;
  phoneNumberId:  string;   // from webhook metadata
  wabaId:         string;   // WABA ID (entry.id in webhook)
  from:           string;   // sender's phone number (E.164 without +)
  senderName:     string | null;
  wamid:          string;   // Meta message ID — idempotency key
  type:           string;   // "text" | "image" | "audio" | "video" | "document" | "sticker" | ...
  text:           string | null;
  mediaId?:       string;   // for media messages
  mediaMimeType?: string;
  mediaCaption?:  string;
  latitude?:      number;   // for location messages
  longitude?:     number;
  timestamp:      number;   // unix seconds from Meta
  isEcho:         boolean;  // true = sent by the business itself
  receivedAt:     string;   // ISO — end-to-end latency tracking
}

/**
 * Outbound Cloud API message send.
 * Rate-limited — keep concurrency low (WAC limits: 250 msgs/sec per WABA).
 */
export interface WACOutboundJob {
  accountId:      string;   // whatsapp_cloud_accounts.id (UUID)
  userId:         string;
  to:             string;   // recipient's phone (E.164 without +)
  content:        string;
  conversationId: string;
  /** Pre-written CRM messages row — patch external_id after send when present */
  messageId?:     string;
  origin:         "automation" | "manual" | "ai_reply" | "campaign";
  templateName?:  string;   // set when type = "template"
  languageCode?:  string;   // e.g. "es" — required with templateName
}

// ─── Universal webhook job payloads ──────────────────────────────────────────

/**
 * Retry job for a lead webhook event that failed inline processing.
 * The full payload lives in the integration_events row — the job only
 * carries the event id, so retries always see the latest DB state.
 */
export interface LeadWebhookJob {
  eventId: string;
  userId:  string;
}

// ─── Job result shapes ────────────────────────────────────────────────────────

export interface MessageJobResult {
  contactId: string | null;
  conversationId: string | null;
  isFirstMessage: boolean;
  skipped: boolean;
  skipReason?: string;
}

export interface OutboundJobResult {
  externalId?: string;
  success: boolean;
  error?: string;
  rateLimited?: boolean;
}
