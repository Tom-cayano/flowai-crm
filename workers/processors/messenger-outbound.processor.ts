// Facebook Messenger outbound message processor.
//
// For each FBOutboundJob it:
//   1. Resolves the page access token for the page_id
//   2. Sends the message via Messenger Send API (Graph v21.0)
//   3. Updates the pre-written CRM messages row with the external MID (if messageId present)

import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessengerMessage, getPageAccessToken } from "@/lib/messenger/client";
import type { FBOutboundJob } from "@/lib/queue/types";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { incrementUsage } from "@/lib/billing/usage";

export async function processMessengerOutbound(job: FBOutboundJob): Promise<void> {
  // ── Resolve page access token ──────────────────────────────────────────────
  const pageToken = await getPageAccessToken(job.pageId);
  if (!pageToken) {
    console.error(
      `[fbm-out] No page access token for pageId ${job.pageId}. ` +
      "Set FACEBOOK_PAGE_ACCESS_TOKEN env var or connect the page via the dashboard."
    );
    // Throw so BullMQ retries — token may become available after setup
    throw new Error(`No page access token for pageId ${job.pageId}`);
  }

  // ── Send via Messenger Send API ────────────────────────────────────────────
  const result = await sendMessengerMessage(job.recipientPsid, job.content, pageToken);

  // ── Update pre-written CRM message row with external MID ─────────────────
  if (job.messageId && result.message_id) {
    const db = createAdminClient();
    await db
      .from("messages")
      .update({ external_id: result.message_id, status: "sent" })
      .eq("id", job.messageId);
  } else if (result.message_id) {
    const workspaceId = await getUserPrimaryWorkspace(job.userId);
    if (workspaceId) {
      void incrementUsage(workspaceId, "messages_sent");
    }
  }

  console.info(
    `[fbm-out] Sent | page=${job.pageId} psid=${job.recipientPsid} mid=${result.message_id}`
  );
}
