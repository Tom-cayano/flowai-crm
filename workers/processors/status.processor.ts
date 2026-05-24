// Delivery receipt processor — updates message status in both
// whatsapp_messages and messages (CRM) tables.

import { createAdminClient } from "@/lib/supabase/admin";
import type { StatusJob } from "@/lib/queue/types";

type WppStatus  = "pending" | "sent" | "delivered" | "read" | "played" | "received" | "failed";
type CrmStatus  = "sent" | "delivered" | "read" | "failed";

const STATUS_MAP: Record<number, WppStatus> = {
  1: "sent",
  2: "delivered",
  3: "read",
  4: "played",
};

export async function processStatus(job: StatusJob): Promise<void> {
  const { updates } = job;
  if (!updates.length) return;

  const db = createAdminClient();

  await Promise.allSettled(
    updates.map(async ({ key, update }) => {
      if (!key?.fromMe) return;

      const wppStatus = STATUS_MAP[update?.status];
      if (!wppStatus) return;

      await db
        .from("whatsapp_messages")
        .update({ status: wppStatus })
        .eq("external_id", key.id)
        .eq("from_me", true);

      // CRM table uses a simpler status set — map "played" → "read"
      const crmStatus: CrmStatus = wppStatus === "played" ? "read" : (wppStatus as CrmStatus);
      await db
        .from("messages")
        .update({ status: crmStatus })
        .eq("external_id", key.id)
        .eq("sender", "agent");

      console.info(`[status-processor] ${key.id} → ${wppStatus}`);
    })
  );
}
