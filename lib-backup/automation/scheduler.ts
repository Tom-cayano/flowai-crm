// Manages scheduled task persistence for wait_delay nodes.
// When the engine encounters a wait_delay node, it persists a scheduled_tasks
// row and returns early. A separate cron job (or BullMQ delayed job) calls
// resumeExecution() at run_at time.

import { createAdminClient } from "@/lib/supabase/admin";
import type { ExecutionContext } from "@/types/automation";

export interface ScheduleWaitOptions {
  ctx: ExecutionContext;
  nodeId: string;
  durationMs: number;
  nextNodeId: string;
}

/** Persist a scheduled continuation and return the task id. */
export async function scheduleWait({
  ctx,
  nodeId,
  durationMs,
  nextNodeId,
}: ScheduleWaitOptions): Promise<string> {
  const db = createAdminClient();
  const runAt = new Date(Date.now() + durationMs).toISOString();

  const { data, error } = await db
    .from("scheduled_tasks")
    .insert({
      user_id:       ctx.userId,
      automation_id: ctx.automationId,
      execution_id:  ctx.executionId,
      node_id:       nodeId,
      run_at:        runAt,
      payload:       {
        nextNodeId,
        context: ctx,
      } as unknown as import("@/types/supabase").Json,
      status:        "pending",
    })
    .select("id")
    .single();

  if (error) throw new Error(`[scheduler] Failed to create task: ${error.message}`);
  return data.id;
}

/** Mark a task as running and return its payload. */
export async function claimTask(taskId: string): Promise<{
  nextNodeId: string;
  context: ExecutionContext;
} | null> {
  const db = createAdminClient();

  const { data, error } = await db
    .from("scheduled_tasks")
    .update({ status: "running" })
    .eq("id", taskId)
    .eq("status", "pending")
    .select("payload")
    .single();

  if (error || !data) return null;
  return data.payload as unknown as { nextNodeId: string; context: ExecutionContext };
}

/** Mark a task as done. */
export async function completeTask(taskId: string): Promise<void> {
  const db = createAdminClient();
  await db.from("scheduled_tasks").update({ status: "done" }).eq("id", taskId);
}

/** Fetch all overdue pending tasks (for the cron runner). */
export async function fetchDueTasks(limit = 50): Promise<
  Array<{ id: string; payload: { nextNodeId: string; context: ExecutionContext } }>
> {
  const db = createAdminClient();
  const { data } = await db
    .from("scheduled_tasks")
    .select("id, payload")
    .eq("status", "pending")
    .lte("run_at", new Date().toISOString())
    .order("run_at", { ascending: true })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id:      row.id,
    payload: row.payload as unknown as { nextNodeId: string; context: ExecutionContext },
  }));
}
