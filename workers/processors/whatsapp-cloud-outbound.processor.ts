// WhatsApp Cloud API — outbound message processor.
//
// For each WACOutboundJob it:
//   1. Resolves credentials (phone_number_id + access_token) from whatsapp_cloud_accounts
//   2. Sends the message via Meta Cloud API (Graph v21.0)
//   3. Updates the pre-written CRM messages row with the wamid returned by Meta
//   4. Marks the message as "sent"

import { createAdminClient } from "@/lib/supabase/admin";
import type { WACOutboundJob } from "@/lib/queue/types";

type DB = ReturnType<typeof createAdminClient>;

const GRAPH_VERSION = "v21.0";

interface WACAccount {
  phone_number_id:    string;
  access_token:       string;
}

interface MetaSendResponse {
  messages?: Array<{ id: string }>;
  error?:    { message: string; code: number };
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function processWACOutbound(job: WACOutboundJob): Promise<void> {
  const db = createAdminClient();

  // ── Resolve account credentials ───────────────────────────────────────────
  const account = await resolveAccount(db, job.accountId);
  if (!account) {
    throw new Error(`[wac-out] No active account / credentials for accountId ${job.accountId}`);
  }

  // ── Send via Cloud API ────────────────────────────────────────────────────
  const wamid = await sendCloudMessage(account, job.to, job.content);

  // ── Update pre-written CRM message row ────────────────────────────────────
  if (job.messageId && wamid) {
    await db
      .from("messages")
      .update({ external_id: wamid, status: "sent" })
      .eq("id", job.messageId);
  }

  console.info(
    `[wac-out] Sent | account=${job.accountId} to=+${job.to} wamid=${wamid}`
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveAccount(db: DB, accountId: string): Promise<WACAccount | null> {
  const { data } = await db
    .from("whatsapp_cloud_accounts")
    .select("phone_number_id, access_token")
    .eq("id", accountId)
    .eq("is_active", true)
    .maybeSingle();

  if (!data?.phone_number_id || !data?.access_token) return null;
  return data as WACAccount;
}

async function sendCloudMessage(
  account: WACAccount,
  to:      string,
  text:    string,
): Promise<string | null> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${account.phone_number_id}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type:    "individual",
    to:                to.replace(/^\+/, ""),  // Meta expects without leading +
    type:              "text",
    text:              { preview_url: false, body: text },
  };

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${account.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const json = (await res.json()) as MetaSendResponse;

  if (!res.ok || json.error) {
    throw new Error(
      `[wac-out] Meta API error ${res.status}: ${json.error?.message ?? "unknown"}`
    );
  }

  return json.messages?.[0]?.id ?? null;
}
