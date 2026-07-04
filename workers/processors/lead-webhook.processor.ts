// Lead webhook retry processor — re-runs failed universal webhook events.
//
// The inline processing in POST /api/webhooks/leads handles the happy path;
// this worker only sees events whose first attempt failed (DB hiccup, etc.).
// BullMQ retries with exponential backoff (5 attempts). When every attempt
// is exhausted the event row is marked "dead" and surfaces in the panel.

import { createAdminClient } from "@/lib/supabase/admin";
import { processLeadEvent } from "@/lib/integrations/lead-processor";
import type { LeadWebhookJob } from "@/lib/queue/types";
import type { Job } from "bullmq";

export async function processLeadWebhook(job: Job<LeadWebhookJob>): Promise<void> {
  const { eventId } = job.data;
  const db = createAdminClient();

  // Skip events another attempt already completed (idempotency guard)
  const { data: event } = await db
    .from("integration_events")
    .select("status")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) {
    console.warn(`[lead-webhook] Event ${eventId} no longer exists — skipping`);
    return;
  }
  if (event.status === "processed") return;

  await db
    .from("integration_events")
    .update({ status: "retrying" })
    .eq("id", eventId);

  try {
    const result = await processLeadEvent(eventId);
    console.info(
      `[lead-webhook] Retry succeeded event=${eventId} contact=${result.contactId}` +
      ` created=${result.contactCreated} automations=${result.automationsTriggered.length}`
    );
  } catch (err) {
    const maxAttempts = job.opts.attempts ?? 1;
    const exhausted   = job.attemptsMade + 1 >= maxAttempts;

    if (exhausted) {
      await db
        .from("integration_events")
        .update({ status: "dead" })
        .eq("id", eventId);
      console.error(`[lead-webhook] Event ${eventId} exhausted all retries — marked dead`);
    }
    throw err; // re-throw so BullMQ schedules the next backoff attempt
  }
}
