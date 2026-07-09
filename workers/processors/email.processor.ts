// Processor de envío de email (Resend) — reintentos gestionados por BullMQ.

import { createAdminClient } from "@/lib/supabase/admin";
import { deliverEmail } from "@/lib/email/send";
import type { EmailJob } from "@/lib/queue/types";
import type { Job } from "bullmq";

export async function processEmail(job: Job<EmailJob>): Promise<void> {
  const db = createAdminClient();
  await db.from("email_logs")
    .update({ attempts: job.attemptsMade + 1 })
    .eq("id", job.data.logId);

  await deliverEmail(job.data);
}
