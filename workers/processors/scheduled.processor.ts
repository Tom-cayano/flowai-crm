// Scheduled task processor — resumes automation workflows after wait_delay.
// Called by BullMQ after the delay expires for a wpp:scheduled job.

import { claimTask, completeTask } from "@/lib/automation/scheduler";
import { resumeWorkflow } from "@/lib/automation/engine";
import type { ScheduledJob } from "@/lib/queue/types";

export async function processScheduled(job: ScheduledJob): Promise<void> {
  const payload = await claimTask(job.taskId);

  if (!payload) {
    // Already claimed, cancelled, or done — skip silently
    console.info(`[scheduled-processor] Task ${job.taskId} not claimable — skipping`);
    return;
  }

  console.info(
    `[scheduled-processor] Resuming execution=${payload.context.executionId}` +
    ` from node=${payload.nextNodeId}`
  );

  await resumeWorkflow(payload.context, payload.nextNodeId);
  await completeTask(job.taskId);

  console.info(`[scheduled-processor] Task ${job.taskId} complete`);
}
