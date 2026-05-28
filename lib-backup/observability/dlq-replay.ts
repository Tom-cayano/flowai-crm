// Replay helper — re-enqueues a failed job onto its original BullMQ queue.
// Kept in a separate file so dlq.ts stays free of queue imports
// (avoiding circular deps when queue modules import from observability).
//
// Covers ALL queue names defined in QUEUE_NAMES including IG, FBM, and AI.
// Each case is a safe lookup — unknown queues return null and throw at caller level.

import type { JobFailureRow } from "./dlq";
import { QUEUE_NAMES } from "@/lib/queue/types";
import {
  // WhatsApp
  getMessageQueue,
  getStatusQueue,
  getMediaQueue,
  getAutomationQueue,
  getOutboundQueue,
  getConnectionQueue,
  getSessionQueue,
  getScheduledQueue,
  getTriggerQueue,
  getAIQueue,
  // Instagram
  getIGMessageQueue,
  getIGOutboundQueue,
  getIGCommentQueue,
  getIGMediaQueue,
  getIGTokenQueue,
  // Facebook Messenger
  getFBMMessageQueue,
  getFBMOutboundQueue,
} from "@/lib/queue/queues";
import type { Queue } from "bullmq";

// ─── Queue resolver ───────────────────────────────────────────────────────────
// Maps every QUEUE_NAME constant to its singleton getter.
// Adding a new queue: add the import above + one case here.

function getQueue(name: string): Queue | null {
  switch (name) {
    // ── WhatsApp ──────────────────────────────────────────────────────────────
    case QUEUE_NAMES.WPP_MESSAGE:    return getMessageQueue()    as unknown as Queue;
    case QUEUE_NAMES.WPP_STATUS:     return getStatusQueue()     as unknown as Queue;
    case QUEUE_NAMES.WPP_MEDIA:      return getMediaQueue()      as unknown as Queue;
    case QUEUE_NAMES.WPP_AUTOMATION: return getAutomationQueue() as unknown as Queue;
    case QUEUE_NAMES.WPP_OUTBOUND:   return getOutboundQueue()   as unknown as Queue;
    case QUEUE_NAMES.WPP_CONNECTION: return getConnectionQueue() as unknown as Queue;
    case QUEUE_NAMES.WPP_SESSION:    return getSessionQueue()    as unknown as Queue;
    case QUEUE_NAMES.WPP_SCHEDULED:  return getScheduledQueue()  as unknown as Queue;
    case QUEUE_NAMES.WPP_TRIGGER:    return getTriggerQueue()    as unknown as Queue;
    case QUEUE_NAMES.WPP_AI:         return getAIQueue()         as unknown as Queue;
    // ── Instagram ─────────────────────────────────────────────────────────────
    case QUEUE_NAMES.IGM_MESSAGE:    return getIGMessageQueue()  as unknown as Queue;
    case QUEUE_NAMES.IGM_OUTBOUND:   return getIGOutboundQueue() as unknown as Queue;
    case QUEUE_NAMES.IGM_COMMENT:    return getIGCommentQueue()  as unknown as Queue;
    case QUEUE_NAMES.IGM_MEDIA:      return getIGMediaQueue()    as unknown as Queue;
    case QUEUE_NAMES.IGM_TOKEN:      return getIGTokenQueue()    as unknown as Queue;
    // ── Facebook Messenger ────────────────────────────────────────────────────
    case QUEUE_NAMES.FBM_MESSAGE:    return getFBMMessageQueue()  as unknown as Queue;
    case QUEUE_NAMES.FBM_OUTBOUND:   return getFBMOutboundQueue() as unknown as Queue;
    // ── Unknown ───────────────────────────────────────────────────────────────
    default: return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function enqueueJobOnQueue(failure: JobFailureRow): Promise<string> {
  const q = getQueue(failure.queue_name);
  if (!q) throw new Error(`Unknown queue for DLQ replay: ${failure.queue_name}`);

  const job = await q.add(
    `${failure.job_name}:replay`,
    failure.data,
    { attempts: 3, backoff: { type: "exponential", delay: 2_000 } }
  );
  return job.id ?? "";
}
