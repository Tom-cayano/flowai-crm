// Instagram inbound DM processor.
//
// For each IGMessageJob it:
//   1. Guards: skips echoes (own sends), skips read-receipt-only events
//   2. Resolves instagram_accounts row via pageId
//   3. Checks idempotency (instagram_webhook_events)
//   4. Upserts instagram_contacts (ig_username + display_name + avatar_url)
//   5. Upserts contacts (CRM) — updates name if was fallback
//   6. Links instagram_contacts.contact_id → contacts.id
//   7. Upserts instagram_threads (with CRM conversation link)
//   8. Inserts instagram_messages (dedup by ig_message_id)
//   9. Mirrors to CRM layer (contacts + conversations + messages)
//  10. Enqueues IGMediaJob if message has an attachment
//  11. Enqueues AutomationJob for instagram_dm_received trigger

import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueAutomation, enqueueIGMedia } from "@/lib/queue/producers";
import { getAccessToken } from "@/lib/instagram/token-store";
import { getIGSenderInfo } from "@/lib/instagram/client";
import type { IGMessageJob } from "@/lib/queue/types";

type DB = ReturnType<typeof createAdminClient>;

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function processIGMessage(job: IGMessageJob): Promise<void> {
  console.log("[ig-msg] ── processIGMessage START ──────────────────────────");
  console.log("[ig-msg] RAW JOB:", JSON.stringify(job, null, 2));

  // Echoes are messages sent by the page itself — skip to avoid feedback loops
  if (job.isEcho) {
    console.log("[ig-msg] SKIP: isEcho=true");
    return;
  }
  if (!job.mid) {
    console.log("[ig-msg] SKIP: mid is empty/null");
    return;
  }

  const db = createAdminClient();

  // ── Resolve account from pageId ──────────────────────────────────────────
  console.log("[ig-msg] Resolving account for pageId:", job.pageId);
  const account = await resolveAccount(db, job.pageId);
  if (!account) {
    console.warn(
      `[ig-msg] ❌ No active account found for pageId=${job.pageId} — dropping job.\n` +
      `  Check: instagram_accounts.ig_user_id = '${job.pageId}' with is_active=true and connection_state='connected'`
    );
    return;
  }

  const { id: accountId, user_id: userId } = account;
  console.log("[ig-msg] ✅ Account resolved:", { accountId, userId });

  // ── Resolve sender display name ────────────────────────────────────────────
  // Meta DM webhooks do NOT include username in msg.sender — only comment webhooks do.
  // We must call Graph API /{igsid}?fields=username,name,profile_pic with the page token.
  const webhookUsername = job.senderUsername ?? null;
  console.log("[ig-msg] webhookUsername from payload:", webhookUsername ?? "NULL (expected for DMs)");
  console.log("[ig-msg] senderId (IGSID):", job.senderId);

  let senderInfo: { name: string | null; profilePic: string | null };

  if (webhookUsername) {
    console.log("[ig-msg] Using webhookUsername directly:", webhookUsername);
    senderInfo = { name: webhookUsername, profilePic: null };
  } else {
    console.log("[ig-msg] Attempting Graph API lookup for senderId:", job.senderId);
    const pageToken = await getAccessToken(accountId);
    if (!pageToken) {
      console.warn(
        `[ig-msg] ⚠️  getAccessToken returned null for accountId=${accountId}.\n` +
        `  This means either:\n` +
        `  1. instagram_accounts.page_id is NULL for this account\n` +
        `  2. facebook_pages has no row for that page_id\n` +
        `  3. facebook_pages.page_access_token_enc is NULL\n` +
        `  → senderInfo will be null. Username CANNOT be resolved.`
      );
      senderInfo = { name: null, profilePic: null };
    } else {
      console.log("[ig-msg] Page token obtained, calling getIGSenderInfo...");
      senderInfo = await getIGSenderInfo(job.senderId, pageToken);
      console.log("[ig-msg] getIGSenderInfo result:", JSON.stringify(senderInfo));

      if (!senderInfo.name) {
        console.warn(
          `[ig-msg] ⚠️  getIGSenderInfo returned name=null for senderId=${job.senderId}.\n` +
          `  Possible causes:\n` +
          `  1. 'instagram_business_basic' permission is under Meta App Review → EXTERNAL, cannot fix in code\n` +
          `  2. Page token is valid but sender is not accessible (private account)\n` +
          `  3. IGSID is not valid for this page\n` +
          `  → Fallback: username will be set to null; conversation will show ig:${job.senderId}`
        );
      }
    }
  }

  console.log("[ig-msg] Final senderInfo:", JSON.stringify(senderInfo));

  // ── Idempotency guard ──────────────────────────────────────────────────────
  console.log("[ig-msg] Checking idempotency for mid:", job.mid);
  const alreadyProcessed = await checkAndRecordEvent(db, job.mid, "message", accountId, {
    senderId:       job.senderId,
    senderUsername: job.senderUsername,
    text:           job.text,
    attachments:    job.attachments,
    timestamp:      job.timestamp,
    pageId:         job.pageId,
  });
  if (alreadyProcessed) {
    console.info(`[ig-msg] DUPLICATE mid=${job.mid} — skipping (already processed)`);
    return;
  }
  console.log("[ig-msg] Idempotency OK — proceeding");

  const text         = job.text ?? "";
  const attachments  = job.attachments ?? [];
  const hasAttachment = attachments.length > 0;
  const messageType  = resolveMessageType(attachments[0]?.type ?? null);
  const mediaUrl     = attachments[0]?.payload?.url ?? null;
  const timestamp    = new Date(job.timestamp).toISOString();

  console.log("[ig-msg] Parsed message:", { text, hasAttachment, messageType, mediaUrl, timestamp });

  // ── Check contact existence BEFORE upsert (needed for isFirstMessage) ─────
  const { data: priorIGContact } = await db
    .from("instagram_contacts")
    .select("id")
    .eq("account_id", accountId)
    .eq("ig_user_id", job.senderId)
    .maybeSingle();

  console.log("[ig-msg] Prior IG contact exists:", priorIGContact ? `id=${priorIGContact.id}` : "NO (first message)");

  // ── Upsert Instagram contact (with full name/avatar population) ────────────
  console.log("[ig-msg] Upserting IG contact...");
  const igContact = await upsertIGContact(
    db, accountId, userId, job.senderId,
    senderInfo.name, senderInfo.profilePic,
  );
  console.log("[ig-msg] IG contact after upsert:", JSON.stringify(igContact));

  // ── Upsert CRM contact ────────────────────────────────────────────────────
  // Prefer ig_username from the DB row (most up to date), then senderInfo.name
  const resolvedUsername = igContact?.ig_username ?? senderInfo.name ?? null;
  console.log("[ig-msg] Resolved username for CRM contact:", resolvedUsername ?? "NULL → will use ig: fallback");

  const crmContactId = await upsertCrmContact(db, userId, job.senderId, resolvedUsername);
  console.log("[ig-msg] CRM contact id:", crmContactId ?? "NULL (insert failed)");

  // ── Link instagram_contacts.contact_id → contacts.id ─────────────────────
  // This is the fix for the permanent NULL contact_id bug.
  if (igContact?.id && crmContactId) {
    await linkIGContactToCRM(db, igContact.id, crmContactId);
  } else {
    console.warn("[ig-msg] ⚠️  Cannot link contact_id: igContact.id=", igContact?.id, "crmContactId=", crmContactId);
  }

  // ── Upsert CRM conversation ────────────────────────────────────────────────
  const senderDisplayName = resolvedUsername
    ? (resolvedUsername.startsWith("@") ? resolvedUsername : `@${resolvedUsername}`)
    : `ig:${job.senderId}`;

  console.log("[ig-msg] Conversation display name:", senderDisplayName);

  const crmConv = await upsertCrmConversation(db, userId, crmContactId, job.senderId, senderDisplayName);
  if (!crmConv) {
    console.error("[ig-msg] ❌ Failed to upsert CRM conversation — dropping job");
    return;
  }
  console.log("[ig-msg] CRM conversation:", { id: crmConv.id, unread_count: crmConv.unread_count });

  // ── Upsert Instagram thread ────────────────────────────────────────────────
  console.log("[ig-msg] Upserting IG thread...");
  const igThread = await upsertIGThread(
    db, accountId, userId, job.senderId, crmConv.id, igContact?.id ?? null
  );
  if (!igThread) {
    console.error("[ig-msg] ❌ Failed to upsert Instagram thread — dropping job");
    return;
  }
  console.log("[ig-msg] IG thread id:", igThread.id);

  // ── Insert Instagram message (dedup by ig_message_id) ─────────────────────
  console.log("[ig-msg] Inserting IG message mid:", job.mid);
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
  console.log("[ig-msg] IG message inserted:", igMsgId ?? "NULL (duplicate or error)");

  // ── Mirror to CRM messages ─────────────────────────────────────────────────
  const crmMsgType = ((): "text" | "image" | "audio" | "document" => {
    if (messageType === "audio")    return "audio";
    if (messageType === "document") return "document";
    if (messageType === "text")     return "text";
    return "image";
  })();

  console.log("[ig-msg] Inserting CRM message type:", crmMsgType);
  const { data: crmMsg, error: crmMsgErr } = await db.from("messages").insert({
    conversation_id: crmConv.id,
    content:         text || (hasAttachment ? `[${messageType}]` : ""),
    type:            crmMsgType,
    sender:          "contact",
    status:          "delivered",
    media_url:       mediaUrl || null,
  }).select("id").single();

  if (crmMsgErr) {
    console.error("[ig-msg] ❌ CRM message insert error:", crmMsgErr.message, crmMsgErr.code, crmMsgErr.details);
  } else {
    console.log("[ig-msg] CRM message inserted:", crmMsg?.id);
  }

  // Track the CRM message id on the instagram_messages row for cross-ref
  if (crmMsg?.id && igMsgId) {
    const { error: extErr } = await db.from("instagram_messages")
      .update({ external_id: crmMsg.id })
      .eq("id", igMsgId);
    if (extErr) {
      console.error("[ig-msg] ❌ Failed to update external_id:", extErr.message);
    }
  }

  // Update conversation preview
  const { error: convUpdateErr } = await db.from("conversations").update({
    last_message_preview:  (text || `[${messageType}]`).substring(0, 120),
    last_message_at:       timestamp,
    last_message_sender:   "contact",
    unread_count:          crmConv.unread_count + 1,
    updated_at:            new Date().toISOString(),
  }).eq("id", crmConv.id);

  if (convUpdateErr) {
    console.error("[ig-msg] ❌ Failed to update conversation preview:", convUpdateErr.message);
  } else {
    console.log("[ig-msg] Conversation preview updated");
  }

  // ── Enqueue media download if attachment present ────────────────────────────
  if (hasAttachment && mediaUrl && igMsgId) {
    console.log("[ig-msg] Enqueueing IGMedia job for mediaUrl:", mediaUrl);
    await enqueueIGMedia({
      messageId: igMsgId,
      mid:       job.mid,
      accountId,
      userId,
      mediaUrl,
      mediaType: (messageType === "video" ? "video" : messageType === "audio" ? "audio" : "image"),
    }).catch((err) => console.error("[ig-msg] ❌ enqueueIGMedia failed:", err instanceof Error ? err.message : String(err)));
  }

  // ── Enqueue automation ─────────────────────────────────────────────────────
  const isFirstMessage = !priorIGContact;
  console.log("[ig-msg] Enqueueing automation isFirstMessage:", isFirstMessage);
  await enqueueAutomation({
    userId,
    conversationId: crmConv.id,
    contactId:      crmContactId,
    phone:          job.senderId,
    incomingText:   text,
    isFirstMessage,
    instanceName:   `ig:${accountId}`,
    serverUrl:      "",
    instanceApiKey: "",
    triggerType:    isFirstMessage ? "instagram_first_contact" : "instagram_dm_received",
    igAccountId:    accountId,
    igUserId:       job.senderId,
  }).catch((err) => console.error("[ig-msg] ❌ enqueueAutomation failed:", err instanceof Error ? err.message : String(err)));

  console.log("[ig-msg] ── processIGMessage DONE ───────────────────────────");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveAccount(db: DB, pageId: string) {
  const { data, error } = await db
    .from("instagram_accounts")
    .select("id, user_id")
    .eq("ig_user_id", pageId)
    .eq("is_active", true)
    .eq("connection_state", "connected")
    .maybeSingle();

  if (error) {
    console.error("[ig-msg] resolveAccount DB error:", error.message, error.code);
  }
  return data;
}

async function checkAndRecordEvent(
  db:          DB,
  eventId:     string,
  eventType:   string,
  accountId:   string,
  rawPayload:  import("@/types/supabase").Json,
): Promise<boolean> {
  const { error } = await db.from("instagram_webhook_events").insert({
    event_id:    eventId,
    event_type:  eventType,
    account_id:  accountId,
    raw_payload: rawPayload,
  });
  if (error && !error.message.includes("duplicate") && !error.message.includes("unique")) {
    console.error("[ig-msg] checkAndRecordEvent unexpected error:", error.message, error.code);
  }
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
  console.log("[ig-msg] upsertIGContact:", { accountId, igUserId, senderName, avatarUrl });

  // First: upsert the base row (always update last_seen_at)
  const { data, error: upsertErr } = await db
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
    .select("id, ig_username, display_name, avatar_url, contact_id")
    .single();

  if (upsertErr) {
    console.error("[ig-msg] ❌ upsertIGContact base upsert error:", upsertErr.message, upsertErr.code, upsertErr.details);
    return null;
  }

  console.log("[ig-msg] IG contact current state:", JSON.stringify(data));

  // Second: update name/avatar fields when we have new information.
  // FIX: always update if senderName arrived (even if row already has a value)
  // so that we can correct a previously-stored wrong value.
  // Only skip if senderName is null (Graph API failed).
  if (data && senderName) {
    const updateFields: { ig_username: string; display_name: string; avatar_url?: string } = {
      ig_username:  senderName,
      display_name: senderName,
    };
    if (avatarUrl) {
      updateFields.avatar_url = avatarUrl;
    }

    console.log("[ig-msg] Updating IG contact fields:", JSON.stringify(updateFields));

    const { error: updateErr } = await db
      .from("instagram_contacts")
      .update(updateFields)
      .eq("id", data.id);

    if (updateErr) {
      console.error("[ig-msg] ❌ upsertIGContact update error:", updateErr.message, updateErr.code, updateErr.details);
    } else {
      data.ig_username  = senderName;
      data.display_name = senderName;
      if (avatarUrl) data.avatar_url = avatarUrl;
      console.log("[ig-msg] ✅ IG contact ig_username + display_name saved:", senderName);
    }
  } else if (!senderName) {
    console.warn("[ig-msg] ⚠️  senderName is null — ig_username/display_name will NOT be updated (Graph API likely blocked by App Review)");
  }

  return data;
}

/**
 * Link instagram_contacts.contact_id to the CRM contacts.id.
 * This was the root cause of contact_id = NULL permanently.
 */
async function linkIGContactToCRM(
  db:           DB,
  igContactId:  string,
  crmContactId: string,
): Promise<void> {
  const { error } = await db
    .from("instagram_contacts")
    .update({ contact_id: crmContactId })
    .eq("id", igContactId);

  if (error) {
    console.error("[ig-msg] ❌ linkIGContactToCRM error:", error.message, error.code);
  } else {
    console.log("[ig-msg] ✅ instagram_contacts.contact_id linked →", crmContactId);
  }
}

async function upsertCrmContact(
  db:          DB,
  userId:      string,
  igUserId:    string,
  igUsername:  string | null,
): Promise<string | null> {
  const displayName = igUsername ? `@${igUsername}` : `ig:${igUserId}`;
  console.log("[ig-msg] upsertCrmContact displayName:", displayName);

  const { data: existing, error: selectErr } = await db
    .from("contacts")
    .select("id, name")
    .eq("user_id", userId)
    .eq("phone", igUserId)
    .maybeSingle();

  if (selectErr) {
    console.error("[ig-msg] ❌ upsertCrmContact select error:", selectErr.message);
  }

  if (existing) {
    // FIX: if we now have a real username but stored a fallback, upgrade the name
    const currentIsFallback = existing.name?.startsWith("ig:");
    const newIsReal         = !displayName.startsWith("ig:");

    if (currentIsFallback && newIsReal) {
      console.log("[ig-msg] Upgrading CRM contact name:", existing.name, "→", displayName);
      const { error: updErr } = await db
        .from("contacts")
        .update({ name: displayName })
        .eq("id", existing.id);

      if (updErr) {
        console.error("[ig-msg] ❌ Failed to upgrade contact name:", updErr.message);
      } else {
        console.log("[ig-msg] ✅ CRM contact name upgraded to:", displayName);
      }
    } else {
      console.log("[ig-msg] Existing CRM contact:", existing.id, "name:", existing.name, "(no upgrade needed)");
    }
    return existing.id;
  }

  // Insert new contact
  const { data, error: insertErr } = await db
    .from("contacts")
    .insert({
      user_id: userId,
      name:    displayName,
      phone:   igUserId,
      status:  "active",
      tags:    [],
    })
    .select("id")
    .single();

  if (insertErr) {
    // Race condition — another concurrent job may have inserted. Re-query.
    console.warn("[ig-msg] upsertCrmContact insert conflict:", insertErr.message, "— retrying select");
    const { data: retried } = await db
      .from("contacts")
      .select("id")
      .eq("user_id", userId)
      .eq("phone", igUserId)
      .maybeSingle();
    return retried?.id ?? null;
  }

  console.log("[ig-msg] ✅ New CRM contact created:", data?.id);
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

  const { data: existing, error: selectErr } = await selectOpenConversation();
  if (selectErr) {
    console.error("[ig-msg] ❌ upsertCrmConversation select error:", selectErr.message);
  }

  if (existing) {
    console.log("[ig-msg] Existing conversation:", existing.id, "contact_name:", existing.contact_name);

    // Backfill contact_name if it was previously stored as raw ig:userId
    const currentIsFallback = existing.contact_name?.startsWith("ig:");
    const newIsReal         = !displayName.startsWith("ig:");

    const updateFields: { contact_name?: string; contact_id?: string } = {};
    if (currentIsFallback && newIsReal) {
      updateFields.contact_name = displayName;
      console.log("[ig-msg] Backfilling contact_name:", existing.contact_name, "→", displayName);
    }
    // Also link contact_id if missing
    if (contactId) {
      updateFields.contact_id = contactId;
    }

    if (Object.keys(updateFields).length > 0) {
      const { error: updErr } = await db
        .from("conversations")
        .update(updateFields)
        .eq("id", existing.id);

      if (updErr) {
        console.error("[ig-msg] ❌ Failed to backfill conversation fields:", updErr.message);
      } else {
        console.log("[ig-msg] ✅ Conversation backfilled:", JSON.stringify(updateFields));
      }
    }

    return existing;
  }

  console.log("[ig-msg] Creating new CRM conversation...");
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
    // Race condition: another concurrent job inserted the row between our SELECT and INSERT.
    console.warn("[ig-msg] upsertCrmConversation insert conflict:", error.message, "— retrying select");
    const { data: retried } = await selectOpenConversation();
    return retried ?? null;
  }

  console.log("[ig-msg] ✅ New CRM conversation created:", created?.id);
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
  const { data, error } = await db
    .from("instagram_threads")
    .upsert(
      {
        account_id:      accountId,
        user_id:         userId,
        ig_thread_id:    igUserId,
        ig_contact_id:   igContactId,
        conversation_id: conversationId,
        updated_at:      new Date().toISOString(),
      },
      { onConflict: "account_id,ig_thread_id" }
    )
    .select("id")
    .single();

  if (error) {
    console.error("[ig-msg] ❌ upsertIGThread error:", error.message, error.code);
  }
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

  if (error) {
    if (error.message.includes("duplicate") || error.message.includes("unique") || error.code === "23505") {
      console.info("[ig-msg] insertIGMessage: duplicate mid (idempotent skip):", opts.mid);
    } else {
      console.error("[ig-msg] ❌ insertIGMessage error:", error.message, error.code, error.details);
    }
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
