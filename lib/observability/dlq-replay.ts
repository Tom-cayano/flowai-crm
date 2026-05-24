// Replay helper — re-enqueues a failed job onto its original BullMQ queue.
// Kept in a separate file so dlq.ts stays free of queue imports
// (avoiding circular deps when queue modules import from observability).

import type { JobFailureRow } from "./dlq";
import { QUEUE_NAMES } from "@/lib/queue/types";
import {
  getMessageQueue,
  getStatusQueue,
  getMediaQueue,
  getAutomationQueue,
  getOutboundQueue,
  getConnectionQueue,
  getSessionQueue,
  getScheduledQueue,
  getTriggerQueue,
} from "@/lib/queue/queues";
import type { Queue } from "bullmq";

function getQueue(name: string): Queue | null {
  switch (name) {
    case QUEUE_NAMES.WPP_MESSAGE:    return getMessageQueue()    as unknown as Queue;
    case QUEUE_NAMES.WPP_STATUS:     return getStatusQueue()     as unknown as Queue;
    case QUEUE_NAMES.WPP_MEDIA:      return getMediaQueue()      as unknown as Queue;
    case QUEUE_NAMES.WPP_AUTOMATION: return getAutomationQueue() as unknown as Queue;
    case QUEUE_NAMES.WPP_OUTBOUND:   return getOutboundQueue()   as unknown as Queue;
    case QUEUE_NAMES.WPP_CONNECTION: return getConnectionQueue() as unknown as Queue;
    case QUEUE_NAMES.WPP_SESSION:    return getSessionQueue()    as unknown as Queue;
    case QUEUE_NAMES.WPP_SCHEDULED:  return getScheduledQueue()  as unknown as Queue;
    case QUEUE_NAMES.WPP_TRIGGER:    return getTriggerQueue()    as unknown as Queue;
    default: return null;
  }
}

export async function enqueueJobOnQueue(failure: JobFailureRow): Promise<string> {
  const q = getQueue(failure.queue_name);
  if (!q) throw new Error(`Unknown queue: ${failure.queue_name}`);

  const job = await q.add(
    `${failure.job_name}:replay`,
    failure.data,
    { attempts: 3, backoff: { type: "exponential", delay: 2_000 } }
  );
  return job.id ?? "";
}
