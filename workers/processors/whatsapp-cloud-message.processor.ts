// WhatsApp Cloud API inbound message processor.
//
// For each WACMessageJob it:
//   1. Guards: skips echoes and events without a wamid
//   2. Resolves owner (user_id / workspace_id) from whatsapp_cloud_accounts by phone_number_id
//   3. Checks idempotency (whatsapp_cloud_events by wamid)
//   4. Upserts CRM contact  (phone = E.164 number)
//   5. Upserts CRM conversation (channel = "whatsapp")
//   6. Inserts CRM message
//   7. Updates conversation preview + unread_count
//   8. Enqueues AutomationJob with trigger type "message_received"

import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueAutomation } from "@/lib/queue/producers";
import type { WACMessageJob } from "@/lib/queue/types";

type DB = ReturnType<typeof createAdminClient>;

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function processWACMessage(job: WACMessageJob): Promise<void> {
  if (job.isEcho) return;
  if (!job.wamid)  return;

  const db = createAdminClient();

  // ── Resolve owner from phone_number_id ────────────────────────────────────
  const owner = await resolveAccount(db, job.phoneNumberId);
  if (!owner) {
    console.warn(`[wac-msg] No active account for phoneNumberId ${job.phoneNumberId} — dropping`);
    return;
  }

  const { userId, workspaceId, accountId } = owner;

  // ── Idempotency guard ──────────────────────────────────────────────────────
  const alreadyProcessed = await checkAndRecordEvent(db, job.wamid, "message", accountId);
  if (alreadyProcessed) {
    console.info(`[wac-msg] Duplicate wamid ${job.wamid} — skipping`);
    return;
  }

  const text          = job.text ?? "";
  const messageType   = resolveMessageType(job.type);
  const displayPhone  = `+${job.from}`;  // Add + prefix for display
  const senderName    = job.senderName ?? displayPhone;
  const timestamp     = new Date(job.timestamp * 1000).toISOString();

  // ── Upsert CRM contact ─────────────────────────────────────────────────────
  const crmContactId = await upsertCrmContact(db, userId, displayPhone, senderName);

  // ── Upsert CRM conversation ────────────────────────────────────────────────
  const crmConv = await upsertCrmConversation(
    db, userId, workspaceId, crmContactId, displayPhone, senderName,
  );
  if (!crmConv) {
    console.error("[wac-msg] Failed to upsert CRM conversation — dropping");
    return;
  }

  // ── Insert CRM message ─────────────────────────────────────────────────────
  const contentPreview = text || `[${messageType}]`;
  await db.from("messages").insert({
    conversation_id: crmConv.id,
    content:         contentPreview,
    type:            mapToMessageType(messageType),
    sender:          "contact",
    status:          "delivered",
    external_id:     job.wamid,
  });

  // ── Update conversation preview ────────────────────────────────────────────
  await db.from("conversations").update({
    last_message_preview: contentPreview.substring(0, 120),
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
    phone:          displayPhone,
    incomingText:   text,
    isFirstMessage,
    instanceName:   `wac:${accountId}`,  // embed UUID so executor can route outbound
    serverUrl:      "",
    instanceApiKey: "",
    triggerType:    isFirstMessage ? "first_message" : "message_received",
    wacAccountId:   accountId,
  }).catch((err) => console.warn("[wac-msg] enqueueAutomation failed:", err));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveAccount(
  db:            DB,
  phoneNumberId: string,
): Promise<{ userId: string; workspaceId: string; accountId: string } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db as any)
    .from("whatsapp_cloud_accounts")
    .select("id, user_id, workspace_id")
    .eq("phone_number_id", phoneNumberId)
    .eq("is_active", true)
    .maybeSingle() as { data: { id: string; user_id: string; workspace_id: string } | null };

  if (!data) return null;
  return { userId: data.user_id, workspaceId: data.workspace_id, accountId: data.id };
}

async function checkAndRecordEvent(
  db:        DB,
  wamid:     string,
  eventType: string,
  accountId: string,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any).from("whatsapp_cloud_events").insert({
    event_id:   wamid,
    event_type: eventType,
    account_id: accountId,
    raw_payload: {},
  });
  // Unique constraint on event_id = already processed
  return !!error;
}

async function upsertCrmContact(
  db:          DB,
  userId:      string,
  phone:       string,
  displayName: string,
): Promise<string | null> {
  const { data } = await db
    .from("contacts")
    .upsert(
      { user_id: userId, name: displayName, phone, status: "active", tags: [] },
      { onConflict: "user_id,phone" },
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
  phone:       string,
  contactName: string,
) {
  void workspaceId;

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
      contact_name:  contactName,
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
    text:      "text",
    image:     "image",
    audio:     "audio",
    video:     "video",
    document:  "document",
    sticker:   "image",
    location:  "text",
    contacts:  "text",
    interactive: "text",
    button:    "text",
    order:     "text",
  };
  return map[type] ?? "unsupported";
}

function mapToMessageType(type: string): "text" | "image" | "audio" | "document" {
  if (type === "image" || type === "video" || type === "sticker") return "image";
  if (type === "audio") return "audio";
  if (type === "document") return "document";
  return "text";
}
