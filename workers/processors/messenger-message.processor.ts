// Facebook Messenger inbound message processor.
//
// For each FBMessageJob it:
//   1. Guards: skips echoes (own sends) and events without a MID
//   2. Resolves owner (user_id / workspace_id) from facebook_pages by page_id
//      → falls back to instagram_accounts.page_id if no dedicated facebook_pages row
//   3. Checks idempotency (messenger_webhook_events by MID)
//   4. Upserts CRM contact  (phone = PSID — same dedup key as Instagram uses igUserId)
//   5. Upserts CRM conversation (channel = "messenger")
//   6. Inserts CRM message
//   7. Updates conversation preview + unread_count
//   8. Enqueues AutomationJob with trigger type "message_received"
//
// PLAN-1 (GAP-1 fix):
//   checkAndRecordEvent now stores { sender_id: psid } in raw_payload.
//   This enables sendMessage() in lib/actions/conversations.ts to resolve
//   which facebook_page a given PSID belongs to, fixing multi-page outbound.
//   No schema change — raw_payload is JSONB with default '{}' (column already exists).

import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueAutomation } from "@/lib/queue/producers";
import type { FBMessageJob } from "@/lib/queue/types";

type DB = ReturnType<typeof createAdminClient>;

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function processMessengerMessage(job: FBMessageJob): Promise<void> {
  // Echoes are messages sent by the page itself — skip to avoid feedback loops
  if (job.isEcho) return;
  if (!job.mid)   return;

  const db = createAdminClient();

  // ── Resolve owner from page_id ─────────────────────────────────────────────
  const owner = await resolvePage(db, job.pageId);
  if (!owner) {
    console.warn(`[fbm-msg] No active page for pageId ${job.pageId} — dropping`);
    return;
  }

  const { userId, workspaceId } = owner;

  // ── Idempotency guard ──────────────────────────────────────────────────────
  // PLAN-1: pass job.senderId so raw_payload captures the PSID→page_id mapping.
  // This is used by sendMessage() to route outbound replies to the correct page.
  const alreadyProcessed = await checkAndRecordEvent(
    db,
    job.mid,
    "message",
    job.pageId,
    job.senderId,
  );
  if (alreadyProcessed) {
    console.info(`[fbm-msg] Duplicate mid ${job.mid} — skipping`);
    return;
  }

  const text           = job.text ?? "";
  const attachments    = job.attachments ?? [];
  const hasAttachment  = attachments.length > 0;
  const messageType    = resolveMessageType(attachments[0]?.type ?? null);
  const timestamp      = new Date(job.timestamp).toISOString();

  // ── Upsert CRM contact ─────────────────────────────────────────────────────
  // PSID is used as the phone field — same dedup pattern as Instagram (igUserId → phone)
  const crmContactId = await upsertCrmContact(db, userId, job.senderId);

  // ── Upsert CRM conversation ────────────────────────────────────────────────
  const crmConv = await upsertCrmConversation(db, userId, workspaceId, crmContactId, job.senderId);
  if (!crmConv) {
    console.error("[fbm-msg] Failed to upsert CRM conversation — dropping");
    return;
  }

  // ── Insert CRM message ─────────────────────────────────────────────────────
  await db.from("messages").insert({
    conversation_id: crmConv.id,
    content:         text || (hasAttachment ? `[${messageType}]` : ""),
    type:            messageType === "text" ? "text" : "image",
    sender:          "contact",
    status:          "delivered",
  });

  // ── Update conversation preview ────────────────────────────────────────────
  await db.from("conversations").update({
    last_message_preview: (text || `[${messageType}]`).substring(0, 120),
    last_message_at:      timestamp,
    last_message_sender:  "contact",
    unread_count:         crmConv.unread_count + 1,
    updated_at:           new Date().toISOString(),
  }).eq("id", crmConv.id);

  // ── Enqueue automation ─────────────────────────────────────────────────────
  const isFirstMessage = crmConv.unread_count === 0 && !crmConv.last_message_at;
  await enqueueAutomation({
    userId,
    conversationId: crmConv.id,
    contactId:      crmContactId,
    phone:          job.senderId,  // PSID used as "phone" in automation context
    incomingText:   text,
    isFirstMessage,
    instanceName:   `fbm:${job.pageId}`,
    serverUrl:      "",
    instanceApiKey: "",
    triggerType:    isFirstMessage ? "first_message" : "message_received",
    fbmPageId:      job.pageId,
  }).catch((err) => console.warn("[fbm-msg] enqueueAutomation failed:", err));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve user_id and workspace_id from a Facebook page_id.
 *
 * Resolution order:
 *   1. facebook_pages table (explicit Messenger connection)
 *   2. instagram_accounts table (same page connected via Instagram OAuth)
 */
async function resolvePage(
  db:     DB,
  pageId: string,
): Promise<{ userId: string; workspaceId: string } | null> {
  // ── 1. facebook_pages ──────────────────────────────────────────────────────
  const { data: fbPage } = await db
    .from("facebook_pages")
    .select("user_id, workspace_id")
    .eq("page_id", pageId)
    .eq("is_active", true)
    .maybeSingle();

  if (fbPage) {
    return { userId: fbPage.user_id, workspaceId: fbPage.workspace_id };
  }

  // ── 2. instagram_accounts fallback ─────────────────────────────────────────
  // Same Facebook Page connected via Instagram OAuth — page_id matches
  const { data: igAccount } = await db
    .from("instagram_accounts")
    .select("user_id, workspace_id")
    .eq("page_id", pageId)
    .eq("is_active", true)
    .maybeSingle();

  if (igAccount) {
    return { userId: igAccount.user_id, workspaceId: igAccount.workspace_id };
  }

  return null;
}

/**
 * Record the webhook event for idempotency.
 *
 * Returns true if the event was already processed (unique constraint violation).
 *
 * PLAN-1: senderId is stored in raw_payload.sender_id.
 * This creates a queryable PSID → page_id index inside the existing JSONB column,
 * enabling sendMessage() to resolve which page owns a given PSID for outbound routing.
 *
 * raw_payload schema: { sender_id: string }
 * Column type: JSONB NOT NULL DEFAULT '{}' — no migration required.
 */
async function checkAndRecordEvent(
  db:        DB,
  eventId:   string,
  eventType: string,
  pageId:    string,
  senderId?: string,
): Promise<boolean> {
  const { error } = await db.from("messenger_webhook_events").insert({
    event_id:    eventId,
    event_type:  eventType,
    page_id:     pageId,
    // Store PSID so sendMessage() can later look up pageId → PSID direction.
    // Falls back to empty object for non-message events (no senderId passed).
    raw_payload: senderId !== undefined ? { sender_id: senderId } : {},
  });
  // Unique constraint on event_id = already processed
  return !!error;
}

async function upsertCrmContact(
  db:      DB,
  userId:  string,
  psid:    string,
): Promise<string | null> {
  const { data } = await db
    .from("contacts")
    .upsert(
      {
        user_id: userId,
        name:    `fb:${psid}`,
        phone:   psid,   // PSID stored as phone for dedup (same as Instagram pattern)
        status:  "active",
        tags:    [],
      },
      { onConflict: "user_id,phone" }
    )
    .select("id")
    .single();

  return data?.id ?? null;
}

async function upsertCrmConversation(
  db:          DB,
  userId:      string,
  workspaceId: string,
  contactId:   string | null,
  psid:        string,
) {
  const { data: existing } = await db
    .from("conversations")
    .select("id, unread_count, last_message_at")
    .eq("user_id", userId)
    .eq("contact_phone", psid)
    .eq("channel", "messenger")
    .eq("status", "open")
    .maybeSingle();

  if (existing) return existing;

  void workspaceId; // workspace_id not on conversations schema — resolved via user_id
  const { data: created } = await db
    .from("conversations")
    .insert({
      user_id:       userId,
      contact_id:    contactId,
      contact_name:  `fb:${psid}`,
      contact_phone: psid,
      channel:       "messenger",
      status:        "open",
      tags:          [],
      unread_count:  0,
    })
    .select("id, unread_count, last_message_at")
    .single();

  return created;
}

function resolveMessageType(attachmentType: string | null): string {
  if (!attachmentType) return "text";
  const map: Record<string, string> = {
    image:    "image",
    video:    "video",
    audio:    "audio",
    file:     "image",
    template: "text",
    fallback: "text",
  };
  return map[attachmentType.toLowerCase()] ?? "unsupported";
}
