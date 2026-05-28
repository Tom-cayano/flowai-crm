// WhatsApp Cloud API — inbound message processor.
//
// For each WACMessageJob it:
//   1. Guards: skips echoes (own sends)
//   2. Resolves whatsapp_cloud_accounts row via accountId
//   3. Checks idempotency by wamid
//   4. Upserts CRM contact  (phone = job.from in E.164)
//   5. Upserts CRM conversation (channel = "whatsapp")
//   6. Inserts CRM message
//   7. Updates conversation preview + unread_count
//   8. Enqueues AutomationJob with trigger "message_received"

import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueAutomation } from "@/lib/queue/producers";
import type { WACMessageJob } from "@/lib/queue/types";

type DB = ReturnType<typeof createAdminClient>;

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function processWACMessage(job: WACMessageJob): Promise<void> {
  if (job.isEcho) return;
  if (!job.wamid) return;

  const db = createAdminClient();

  // ── Verify account exists ─────────────────────────────────────────────────
  const account = await resolveAccount(db, job.accountId);
  if (!account) {
    console.warn(`[wac-msg] No active account for accountId ${job.accountId} — dropping`);
    return;
  }

  // ── Idempotency guard ─────────────────────────────────────────────────────
  const alreadyProcessed = await checkAndRecordEvent(db, job.wamid, job.accountId);
  if (alreadyProcessed) {
    console.info(`[wac-msg] Duplicate wamid ${job.wamid} — skipping`);
    return;
  }

  const text       = job.text ?? "";
  const mediaType  = job.type !== "text" ? job.type : null;
  const messageType = resolveMessageType(job.type);
  const timestamp  = new Date(job.timestamp * 1000).toISOString();

  // ── Upsert CRM contact ────────────────────────────────────────────────────
  const phone        = `+${job.from}`;  // ensure E.164
  const crmContactId = await upsertCrmContact(db, job.userId, phone, job.senderName);

  // ── Upsert CRM conversation ───────────────────────────────────────────────
  const crmConv = await upsertCrmConversation(db, job.userId, job.workspaceId, crmContactId, phone);
  if (!crmConv) {
    console.error("[wac-msg] Failed to upsert CRM conversation — dropping");
    return;
  }

  // ── Insert CRM message ────────────────────────────────────────────────────
  await db.from("messages").insert({
    conversation_id: crmConv.id,
    content:         text || (mediaType ? `[${messageType}]` : ""),
    type:            messageType === "text" ? "text" : "image",
    sender:          "contact",
    status:          "delivered",
    external_id:     job.wamid,
  });

  // ── Update conversation preview ───────────────────────────────────────────
  await db.from("conversations").update({
    last_message_preview: (text || `[${messageType}]`).substring(0, 120),
    last_message_at:      timestamp,
    last_message_sender:  "contact",
    unread_count:         crmConv.unread_count + 1,
    updated_at:           new Date().toISOString(),
  }).eq("id", crmConv.id);

  // ── Enqueue automation ────────────────────────────────────────────────────
  const isFirstMessage = crmConv.unread_count === 0 && !crmConv.last_message_at;
  await enqueueAutomation({
    userId:         job.userId,
    conversationId: crmConv.id,
    contactId:      crmContactId,
    phone,
    incomingText:   text,
    isFirstMessage,
    instanceName:   `wac:${job.accountId}`,
    serverUrl:      "",
    instanceApiKey: "",
    triggerType:    isFirstMessage ? "first_message" : "message_received",
    wacAccountId:   job.accountId,
  }).catch((err) => console.warn("[wac-msg] enqueueAutomation failed:", err));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveAccount(db: DB, accountId: string) {
  const { data } = await db
    .from("whatsapp_cloud_accounts")
    .select("id, user_id")
    .eq("id", accountId)
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

async function checkAndRecordEvent(
  db:        DB,
  wamid:     string,
  accountId: string,
): Promise<boolean> {
  // Use a generic webhook events table if one exists, otherwise use upsert pattern
  const { error } = await db
    .from("whatsapp_cloud_events")
    .insert({ wamid, account_id: accountId })
    .select("wamid");
  // Unique constraint on wamid = already processed
  return !!error;
}

async function upsertCrmContact(
  db:     DB,
  userId: string,
  phone:  string,
  name:   string | null,
): Promise<string | null> {
  const { data } = await db
    .from("contacts")
    .upsert(
      {
        user_id: userId,
        name:    name ?? phone,
        phone,
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
  _workspaceId: string,
  contactId:   string | null,
  phone:       string,
) {
  const { data: existing } = await db
    .from("conversations")
    .select("id, unread_count, last_message_at")
    .eq("user_id", userId)
    .eq("contact_phone", phone)
    .eq("channel", "whatsapp")
    .eq("status", "open")
    .maybeSingle();

  if (existing) return existing;

  const { data: created } = await db
    .from("conversations")
    .insert({
      user_id:       userId,
      contact_id:    contactId,
      contact_name:  phone,
      contact_phone: phone,
      channel:       "whatsapp",
      status:        "open",
      tags:          [],
      unread_count:  0,
    })
    .select("id, unread_count, last_message_at")
    .single();

  return created;
}

function resolveMessageType(type: string): string {
  const map: Record<string, string> = {
    text:     "text",
    image:    "image",
    video:    "video",
    audio:    "audio",
    document: "document",
    sticker:  "sticker",
    location: "text",
    contacts: "text",
    reaction: "text",
    button:   "text",
    interactive: "text",
  };
  return map[type.toLowerCase()] ?? "unsupported";
}
