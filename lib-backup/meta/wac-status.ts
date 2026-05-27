// WhatsApp Cloud API delivery receipt processor.
//
// Called from the unified Meta webhook when `statuses` arrive inside a
// "whatsapp_business_account" change entry. Updates the messages table with
// the current delivery state for the corresponding outbound message.
//
// Status flow (from Meta docs):
//   sent → delivered → read
//   sent → failed  (terminal)
//
// Idempotency: UPDATE by external_id — safe to receive duplicates.

import { createAdminClient } from "@/lib/supabase/admin";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WACDeliveryStatus = "sent" | "delivered" | "read" | "failed";

export interface WACStatusUpdate {
  wamid:       string;              // Meta message ID (external_id in messages table)
  status:      WACDeliveryStatus;
  recipientId: string;              // recipient phone (E.164 without +)
  timestamp:   string;              // unix seconds string from Meta
  error?: {
    code:    number;
    title:   string;
    message: string;
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<WACDeliveryStatus, string> = {
  sent:      "sent",
  delivered: "delivered",
  read:      "read",
  failed:    "failed",
};

export async function processWACStatusUpdate(update: WACStatusUpdate): Promise<void> {
  const dbStatus = STATUS_MAP[update.status];
  if (!dbStatus) return;

  const db = createAdminClient();

  const { error } = await db
    .from("messages")
    .update({ status: dbStatus as "sent" | "delivered" | "read" | "failed" })
    .eq("external_id", update.wamid);

  if (error) {
    console.warn(`[wac-status] Failed to update message ${update.wamid}:`, error.message);
  }
}

// ─── Batch helper ─────────────────────────────────────────────────────────────

/** Process an array of status objects from a single webhook entry — non-throwing. */
export async function processWACStatusBatch(
  statuses: Array<{
    id:           string;
    status:       string;
    recipient_id: string;
    timestamp:    string;
    errors?:      Array<{ code: number; title: string; message: string }>;
  }>
): Promise<void> {
  await Promise.allSettled(
    statuses.map((s) =>
      processWACStatusUpdate({
        wamid:       s.id,
        status:      s.status as WACDeliveryStatus,
        recipientId: s.recipient_id,
        timestamp:   s.timestamp,
        error:       s.errors?.[0],
      })
    )
  );
}
