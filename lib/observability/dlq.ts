// Dead-letter queue (DLQ) — records exhausted BullMQ jobs and supports replay.

import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/types/supabase";

export type JobFailureRow = Tables<"job_failures">;

interface RecordFailureOpts {
  queueName:    string;
  jobId:        string;
  jobName:      string;
  data:         unknown;
  opts:         unknown;
  error:        string;
  stackTrace:   string;
  attemptsMade: number;
  userId?:      string | null;
  correlationId?: string | null;
}

export async function recordFailure(opts: RecordFailureOpts): Promise<void> {
  const db = createAdminClient();
  await db.from("job_failures").insert({
    queue_name:     opts.queueName,
    job_id:         opts.jobId,
    job_name:       opts.jobName,
    data:           opts.data as import("@/types/supabase").Json,
    opts:           opts.opts as import("@/types/supabase").Json,
    error:          opts.error,
    stack_trace:    opts.stackTrace,
    attempts_made:  opts.attemptsMade,
    user_id:        opts.userId ?? null,
    correlation_id: opts.correlationId ?? null,
  });
}

interface GetFailuresOpts {
  queueName?: string;
  userId?:    string;
  limit?:     number;
  offset?:    number;
}

export async function getFailures(opts: GetFailuresOpts = {}): Promise<JobFailureRow[]> {
  const db = createAdminClient();
  let q = db
    .from("job_failures")
    .select("*")
    .order("failed_at", { ascending: false })
    .limit(opts.limit ?? 50)
    .range(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 50) - 1);

  if (opts.queueName) q = q.eq("queue_name", opts.queueName);
  if (opts.userId)    q = q.eq("user_id", opts.userId);

  const { data } = await q;
  return data ?? [];
}

interface ReplayResult {
  success:   boolean;
  newJobId?: string;
  error?:    string;
}

export async function replayJob(
  failureId: string,
  replayedBy: string
): Promise<ReplayResult> {
  const db = createAdminClient();

  const { data: failure } = await db
    .from("job_failures")
    .select("*")
    .eq("id", failureId)
    .maybeSingle();

  if (!failure) return { success: false, error: "Job failure record not found" };

  try {
    const { enqueueJobOnQueue } = await import("@/lib/observability/dlq-replay");
    const newJobId = await enqueueJobOnQueue(failure);

    await db
      .from("job_failures")
      .update({
        replayed_at:   new Date().toISOString(),
        replayed_by:   replayedBy,
        replay_job_id: newJobId,
      })
      .eq("id", failureId);

    return { success: true, newJobId };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
