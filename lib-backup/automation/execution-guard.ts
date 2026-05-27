// Guards against duplicate execution, rate-limit abuse, and cancelled/paused automations.
//
// Deduplication: Redis key `exec:dedup:{automationId}:{conversationId}` with a 30s TTL.
// If the key already exists the execution is skipped — prevents double-firing when the
// same event arrives twice (e.g. webhook retries, duplicate Supabase realtime events).
//
// Rate limit: `exec:rate:{automationId}:{conversationId}` key counts executions per hour.
// Default cap is 20 executions/automation/conversation/hour.
//
// Cancellation: reads the automation_executions row before each node to detect
// a `cancelled` status written externally (e.g. by cancelExecution()).

import { getRedis } from "@/lib/redis/client";
import { createAdminClient } from "@/lib/supabase/admin";

const DEDUP_TTL_SEC  = 30;
const RATE_WINDOW_SEC = 3_600;
const RATE_MAX        = Number(process.env.AUTOMATION_RATE_MAX ?? 20);

// ─── Deduplication ────────────────────────────────────────────────────────────

/**
 * Returns true if this (automationId, conversationId) pair fired recently.
 * If false, sets the dedup key so subsequent calls return true for DEDUP_TTL_SEC.
 */
export async function isDuplicate(
  automationId: string,
  conversationId: string | null
): Promise<boolean> {
  if (!conversationId) return false;
  const redis = getRedis();
  const key   = `exec:dedup:${automationId}:${conversationId}`;
  // NX = only set if not exists; returns null if key already existed
  const result = await redis.set(key, "1", "EX", DEDUP_TTL_SEC, "NX");
  return result === null; // null → key already existed → duplicate
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

/**
 * Returns true if this automation has exceeded the per-hour execution cap.
 * Increments the counter (INCR + EXPIRE on first call).
 */
export async function isRateLimited(
  automationId: string,
  conversationId: string | null
): Promise<boolean> {
  if (!conversationId) return false;
  const redis = getRedis();
  const key   = `exec:rate:${automationId}:${conversationId}`;
  const count = await redis.incr(key);
  if (count === 1) {
    // First execution in this window — set TTL
    await redis.expire(key, RATE_WINDOW_SEC);
  }
  return count > RATE_MAX;
}

// ─── Cancellation check ───────────────────────────────────────────────────────

/**
 * Returns true if the execution row has been externally cancelled.
 * Called at the start of each node iteration so long-running workflows
 * can be stopped mid-flight.
 */
export async function isCancelled(executionId: string): Promise<boolean> {
  const db = createAdminClient();
  const { data } = await db
    .from("automation_executions")
    .select("status")
    .eq("id", executionId)
    .maybeSingle();
  return data?.status === "cancelled";
}

// ─── Cancellation API ─────────────────────────────────────────────────────────

/**
 * Marks an execution as cancelled in the DB.
 * If a BullMQ scheduled job (wait_delay continuation) exists, removes it too.
 * The running engine loop will exit on the next isCancelled() poll.
 */
export async function cancelExecution(executionId: string): Promise<void> {
  const db = createAdminClient();

  // Cancel the execution row
  await db
    .from("automation_executions")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", executionId)
    .in("status", ["running"]); // only cancel if still running

  // Cancel any pending scheduled_tasks for this execution
  const { data: tasks } = await db
    .from("scheduled_tasks")
    .select("id")
    .eq("execution_id", executionId)
    .eq("status", "pending");

  if (tasks && tasks.length > 0) {
    await db
      .from("scheduled_tasks")
      .update({ status: "cancelled" })
      .in("id", tasks.map((t) => t.id));

    // Best-effort: remove BullMQ delayed jobs for each task
    const { getScheduledQueue } = await import("@/lib/queue/queues");
    const q = getScheduledQueue();
    await Promise.allSettled(
      tasks.map(async (t) => {
        const job = await q.getJob(`scheduled:${t.id}`);
        if (job) await job.remove();
      })
    );
  }
}

// ─── Automation-level pause guard ────────────────────────────────────────────

/**
 * Returns true if the automation has been set to inactive/draft since the
 * execution was queued. Used as a pre-flight check before starting a workflow.
 */
export async function isAutomationActive(automationId: string): Promise<boolean> {
  const db = createAdminClient();
  const { data } = await db
    .from("automations")
    .select("status")
    .eq("id", automationId)
    .maybeSingle();
  return data?.status === "active";
}
