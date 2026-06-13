// Instagram inbound DM processor.
//
// For each IGMessageJob it:
//   1. Guards: skips echoes (own sends), skips read-receipt-only events
//   2. Resolves instagram_accounts row via pageId
//   3. Checks idempotency (instagram_webhook_events)
//   4. Upserts instagram_contacts
//   5. Upserts instagram_threads (with CRM conversation link)
//   6. Inserts instagram_messages (dedup by ig_message_id)
//   7. Mirrors to CRM layer (contacts + conversations + messages)
//   8. Enqueues IGMediaJob if message has an attachment
//   9. Enqueues AutomationJob for instagram_dm_received trigger

import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueAutomation, enqueueIGMedia } from "@/lib/queue/producers";
import { getAccessToken } from "@/lib/instagram/token-store";
import { getIGSenderInfo } from "@/lib/instagram/client";
import type { IGMessageJob } from "@/lib/queue/types";

type DB = ReturnType<typeof createAdminClient>;

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function processIGMessage(job: IGMessageJob): Promise<void> {
  // Echoes are messages sent by the page itself — skip to avoid feedback loops
  if (job.isEcho) return;
  if (!job.mid)   return;

  const db = createAdminClient();

  // ── Resolve account from pageId ──────────────────────────────────────────
  const account = await resolveAccount(db, job.pageId);
  if (!account) {
    console.warn(`[ig-msg] No active account for pageId ${job.pageId} — dropping`);
    return;
  }

  const { id: accountId, user_id: userId } = account;

  // ── Fetch sender display name from Meta (best-effort, never blocks) ────
  const pageToken   = await getAccessToken(accountId);
  const senderInfo  = pageToken
    ? await getIGSenderInfo(job.senderId, pageToken)
    : { name: null, profilePic: null };

  // ── Idempotency guard ──────────────────────────────────────────────────
  const alreadyProcessed = await checkAndRecordEvent(db, job.mid, "message", accountId);
  if (alreadyProcessed) {
    console.info(`[ig-msg] Duplicate mid ${job.mid} — skipping`);
    return;
  }

  const text         = job.text ?? "";
  const attachments  = job.attachments ?? [];
  const hasAttachment = attachments.length > 0;
  const messageType  = resolveMessageType(attachments[0]?.type ?? null);
  const mediaUrl     = attachments[0]?.payload?.url ?? null;
  const timestamp    = new Date(job.timestamp).toISOString();

  // ── Check contact existence BEFORE upsert (needed for isFirstMessage) ───
  // Must query before upsertIGContact because upsert always returns a row,
  // making it impossible to distinguish new vs returning contacts after the fact.
  const { data: priorIGContact } = await db
    .from("instagram_contacts")
    .select("id")
    .eq("account_id", accountId)
    .eq("ig_user_id", job.senderId)
    .maybeSingle();

  // ── Upsert Instagram contact ───────────────────────────────────────────
  const igContact = await upsertIGContact(
    db, accountId, userId, job.senderId,
    senderInfo.name, senderInfo.profilePic,
  );

  // ── Upsert CRM contact ────────────────────────────────────────────────
  const senderDisplayName = igContact?.ig_username ?? senderInfo.name ?? null;
  const crmContactId = await upsertCrmContact(db, userId, job.senderId, senderDisplayName);

  // ── Upsert CRM conversation ───────────────────────────────────────────
  const contactDisplayName = senderDisplayName
    ? (senderDisplayName.startsWith("@") ? senderDisplayName : `@${senderDisplayName}`)
    : `ig:${job.senderId}`;
  const crmConv = await upsertCrmConversation(db, userId, crmContactId, job.senderId, contactDisplayName);
  if (!crmConv) {
    console.error("[ig-msg] Failed to upsert CRM conversation — dropping");
    return;
  }

  // ── Upsert Instagram thread ────────────────────────────────────────────
  const igThread = await upsertIGThread(
    db, accountId, userId, job.senderId, crmConv.id, igContact?.id ?? null
  );
  if (!igThread) {
    console.error("[ig-msg] Failed to upsert Instagram thread — dropping");
    return;
  }

  // ── Insert Instagram message (dedup by ig_message_id) ─────────────────
  const igMsgId = await insertIGMessage(db, {
    threadId:      igThread.id,
    accountId,
    userId,
    mid:           job.mid,
    fromIgUserId:  job.senderId,
    fromMe:        false,
    content:       text || null,
    messageType,
    mediaUrl,
  });

  // ── Mirror to CRM messages ─────────────────────────────────────────────
  // DB enum for messages.type: "text"|"image"|"audio"|"document"|"template"
  const crmMsgType = ((): "text" | "image" | "audio" | "document" => {
    if (messageType === "audio")    return "audio";
    if (messageType === "document") return "document";
    if (messageType === "text")     return "text";
    return "image"; // image, video, share, story_mention → rendered as image with URL
  })();

  const { data: crmMsg } = await db.from("messages").insert({
    conversation_id: crmConv.id,
    content:         text || (hasAttachment ? `[${messageType}]` : ""),
    type:            crmMsgType,
    sender:          "contact",
    status:          "delivered",
    media_url:       mediaUrl || null,
  }).select("id").single();

  // Track the CRM message id on the instagram_messages row for cross-ref
  if (crmMsg?.id && igMsgId) {
    await db.from("instagram_messages")
      .update({ external_id: crmMsg.id })
      .eq("id", igMsgId);
  }

  // Update conversation preview
  await db.from("conversations").update({
    last_message_preview:  (text || `[${messageType}]`).substring(0, 120),
    last_message_at:       timestamp,
    last_message_sender:   "contact",
    unread_count:          crmConv.unread_count + 1,
    updated_at:            new Date().toISOString(),
  }).eq("id", crmConv.id);

  // ── Enqueue media download if attachment present ────────────────────────
  if (hasAttachment && mediaUrl && igMsgId) {
    await enqueueIGMedia({
      messageId: igMsgId,
      mid:       job.mid,
      accountId,
      userId,
      mediaUrl,
      mediaType: (messageType === "video" ? "video" : messageType === "audio" ? "audio" : "image"),
    }).catch((err) => console.warn("[ig-msg] enqueueIGMedia failed:", err));
  }

  // ── Enqueue automation ─────────────────────────────────────────────────
  // priorIGContact was checked BEFORE the upsert, so null means genuinely new contact.
  const isFirstMessage = !priorIGContact;
  await enqueueAutomation({
    userId,
    conversationId: crmConv.id,
    contactId:      crmContactId,
    phone:          job.senderId,  // IG user ID used as "phone" in automation context
    incomingText:   text,
    isFirstMessage,
    instanceName:   `ig:${accountId}`,
    serverUrl:      "",
    instanceApiKey: "",
    triggerType:    isFirstMessage ? "instagram_first_contact" : "instagram_dm_received",
    igAccountId:    accountId,
    igUserId:       job.senderId,
  }).catch((err) => console.warn("[ig-msg] enqueueAutomation failed:", err));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveAccount(db: DB, pageId: string) {
  const { data } = await db
    .from("instagram_accounts")
    .select("id, user_id")
    .eq("ig_user_id", pageId) // entry.id in IG webhooks is the ig_user_id, not the page_id
    .eq("is_active", true)
    .eq("connection_state", "connected")
    .maybeSingle();
  return data;
}

async function checkAndRecordEvent(
  db:        DB,
  eventId:   string,
  eventType: string,
  accountId: string,
): Promise<boolean> {
  const { error } = await db.from("instagram_webhook_events").insert({
    event_id:   eventId,
    event_type: eventType,
    account_id: accountId,
    raw_payload: {},
  });
  // Unique constraint violation = already processed
  return !!error;
}

async function upsertIGContact(
  db:          DB,
  accountId:   string,
  userId:      string,
  igUserId:    string,
  senderName:  string | null,
  avatarUrl:   string | null,
) {
  const { data } = await db
    .from("instagram_contacts")
    .upsert(
      {
        account_id:   accountId,
        user_id:      userId,
        ig_user_id:   igUserId,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "account_id,ig_user_id" }
    )
    .select("id, ig_username, avatar_url")
    .single();

  // Populate name/avatar only when Meta returned them and DB row still has nulls,
  // so we never overwrite a good value with a failed-fetch null.
  if (data && senderName && !data.ig_username) {
    await db
      .from("instagram_contacts")
      .update({
        ig_username: senderName,
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      })
      .eq("id", data.id);
    data.ig_username = senderName;
  }

  return data;
}

async function upsertCrmContact(
  db:          DB,
  userId:      string,
  igUserId:    string,
  igUsername:  string | null,
): Promise<string | null> {
  const displayName = igUsername ? `@${igUsername}` : `ig:${igUserId}`;

  const { data } = await db
    .from("contacts")
    .upsert(
      {
        user_id: userId,
        name:    displayName,
        phone:   igUserId,  // IG scoped user ID stored as phone for dedup
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
  contactId:   string | null,
  igUserId:    string,
  displayName: string,
) {
  const selectOpenConversation = () =>
    db
      .from("conversations")
      .select("id, unread_count, contact_name")
      .eq("user_id", userId)
      .eq("contact_phone", igUserId)
      .eq("channel", "instagram")
      .eq("status", "open")
      .maybeSingle();

  const { data: existing } = await selectOpenConversation();
  if (existing) {
    // Backfill contact_name if it was previously stored as raw ig:userId
    if (existing.contact_name?.startsWith("ig:") && !displayName.startsWith("ig:")) {
      await db
        .from("conversations")
        .update({ contact_name: displayName })
        .eq("id", existing.id);
    }
    return existing;
  }

  const { data: created, error } = await db
    .from("conversations")
    .insert({
      user_id:       userId,
      contact_id:    contactId,
      contact_name:  displayName,
      contact_phone: igUserId,
      channel:       "instagram",
      status:        "open",
      tags:          [],
      unread_count:  0,
    })
    .select("id, unread_count")
    .single();

  if (error) {
    // Race condition: another concurrent job inserted the row between our SELECT and
    // INSERT. Re-query to pick up whichever row won the race.
    console.warn("[ig-msg] upsertCrmConversation insert conflict — retrying select:", error.message);
    const { data: retried } = await selectOpenConversation();
    return retried ?? null;
  }

  return created;
}

async function upsertIGThread(
  db:             DB,
  accountId:      string,
  userId:         string,
  igUserId:       string,
  conversationId: string,
  igContactId:    string | null,
) {
  const { data } = await db
    .from("instagram_threads")
    .upsert(
      {
        account_id:      accountId,
        user_id:         userId,
        ig_thread_id:    igUserId,  // DM threads use sender's IG user ID as thread key
        ig_contact_id:   igContactId,
        conversation_id: conversationId,
        updated_at:      new Date().toISOString(),
      },
      { onConflict: "account_id,ig_thread_id" }
    )
    .select("id")
    .single();
  return data;
}

async function insertIGMessage(
  db: DB,
  opts: {
    threadId:     string;
    accountId:    string;
    userId:       string;
    mid:          string;
    fromIgUserId: string;
    fromMe:       boolean;
    content:      string | null;
    messageType:  string;
    mediaUrl:     string | null;
  }
): Promise<string | null> {
  const { data, error } = await db
    .from("instagram_messages")
    .insert({
      thread_id:       opts.threadId,
      account_id:      opts.accountId,
      user_id:         opts.userId,
      ig_message_id:   opts.mid,
      from_ig_user_id: opts.fromIgUserId,
      from_me:         opts.fromMe,
      content:         opts.content,
      message_type:    opts.messageType,
      media_url:       opts.mediaUrl,
      status:          "received",
    })
    .select("id")
    .single();

  if (error && !error.message.includes("duplicate")) {
    console.error("[ig-msg] insertIGMessage error:", error.message);
  }

  return data?.id ?? null;
}

function resolveMessageType(attachmentType: string | null): string {
  if (!attachmentType) return "text";
  const map: Record<string, string> = {
    image:         "image",
    video:         "video",
    audio:         "audio",
    file:          "image",
    share:         "share",
    story_mention: "story_mention",
    story_reply:   "story_mention",
    reel:          "video",
    ig_reel:       "video",
  };
  return map[attachmentType.toLowerCase()] ?? "unsupported";
}
