// Job producer helpers — thin wrappers that enqueue jobs with consistent
// options. Call these from the webhook handler or server actions.

import {
  getMessageQueue,
  getStatusQueue,
  getConnectionQueue,
  getAutomationQueue,
  getOutboundQueue,
  getMediaQueue,
  getSessionQueue,
  getScheduledQueue,
  getTriggerQueue,
  getAIQueue,
  getIGMessageQueue,
  getIGOutboundQueue,
  getIGCommentQueue,
  getIGMediaQueue,
  getIGTokenQueue,
  getFBMMessageQueue,
  getFBMOutboundQueue,
  BASE_JOB_OPTIONS,
  RETRY_OPTIONS,
} from "./queues.js";
import type {
  MessageJob,
  StatusJob,
  ConnectionJob,
  AutomationJob,
  OutboundJob,
  MediaJob,
  SessionJob,
  ScheduledJob,
  TriggerJob,
  AIJob,
  IGMessageJob,
  IGOutboundJob,
  IGCommentJob,
  IGMediaJob,
  IGTokenJob,
  FBMessageJob,
  FBOutboundJob,
} from "./types.js";

export async function enqueueMessage(job: MessageJob): Promise<string> {
  const q = getMessageQueue();
  const result = await q.add("process", job, {
    ...BASE_JOB_OPTIONS,
    ...RETRY_OPTIONS,
    // Deduplicate: same WhatsApp message ID shouldn't be processed twice
    jobId: `msg:${job.data.key?.id ?? Date.now()}`,
  });
  return result.id ?? "";
}

export async function enqueueStatus(job: StatusJob): Promise<string> {
  const q = getStatusQueue();
  const result = await q.add("process", job, {
    ...BASE_JOB_OPTIONS,
    ...RETRY_OPTIONS,
  });
  return result.id ?? "";
}

export async function enqueueConnection(job: ConnectionJob): Promise<string> {
  const q = getConnectionQueue();
  const result = await q.add("process", job, {
    ...BASE_JOB_OPTIONS,
    attempts: 5,
    backoff: { type: "fixed", delay: 1_000 },
  });
  return result.id ?? "";
}

export async function enqueueAutomation(job: AutomationJob): Promise<string> {
  const q = getAutomationQueue();
  const result = await q.add("process", job, {
    ...BASE_JOB_OPTIONS,
    ...RETRY_OPTIONS,
  });
  return result.id ?? "";
}

export async function enqueueOutbound(job: OutboundJob): Promise<string> {
  const q = getOutboundQueue();
  const result = await q.add("process", job, {
    ...BASE_JOB_OPTIONS,
    attempts: 4,
    backoff: { type: "exponential", delay: 3_000 },
  });
  return result.id ?? "";
}

export async function enqueueMedia(job: MediaJob): Promise<string> {
  const q = getMediaQueue();
  const result = await q.add("process", job, {
    ...BASE_JOB_OPTIONS,
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    jobId: `media:${job.externalId}`,
  });
  return result.id ?? "";
}

export async function enqueueSession(job: SessionJob): Promise<string> {
  const q = getSessionQueue();
  const result = await q.add("process", job, {
    ...BASE_JOB_OPTIONS,
    attempts: 2,
    backoff: { type: "fixed", delay: 5_000 },
    jobId: `session:${job.instanceName}:${job.action}`,
  });
  return result.id ?? "";
}

export async function enqueueScheduled(
  job: ScheduledJob,
  delayMs: number
): Promise<string> {
  const q = getScheduledQueue();
  const result = await q.add("resume", job, {
    ...BASE_JOB_OPTIONS,
    delay: delayMs,
    attempts: 3,
    backoff: { type: "fixed", delay: 5_000 },
    jobId: `scheduled:${job.taskId}`,
  });
  return result.id ?? "";
}

export async function enqueueTrigger(job: TriggerJob): Promise<string> {
  const q = getTriggerQueue();
  const result = await q.add("process", job, {
    ...BASE_JOB_OPTIONS,
    ...RETRY_OPTIONS,
  });
  return result.id ?? "";
}

export async function enqueueAI(job: AIJob): Promise<string> {
  const q = getAIQueue();
  const result = await q.add("process", job, {
    ...BASE_JOB_OPTIONS,
    attempts: 2,
    backoff: { type: "exponential", delay: 5_000 },
  });
  return result.id ?? "";
}

// ─── Instagram producers ──────────────────────────────────────────────────────

export async function enqueueIGMessage(job: IGMessageJob): Promise<string> {
  const q = getIGMessageQueue();
  const result = await q.add("process", job, {
    ...BASE_JOB_OPTIONS,
    ...RETRY_OPTIONS,
    // Deduplicate: same Meta message ID must never be processed twice
    jobId: `igm:${job.mid}`,
  });
  return result.id ?? "";
}

export async function enqueueIGOutbound(job: IGOutboundJob): Promise<string> {
  const q = getIGOutboundQueue();
  const result = await q.add("process", job, {
    ...BASE_JOB_OPTIONS,
    attempts: 4,
    backoff: { type: "exponential", delay: 3_000 },
  });
  return result.id ?? "";
}

export async function enqueueIGComment(job: IGCommentJob): Promise<string> {
  const q = getIGCommentQueue();
  const result = await q.add("process", job, {
    ...BASE_JOB_OPTIONS,
    ...RETRY_OPTIONS,
    jobId: `igc:${job.commentId}`,
  });
  return result.id ?? "";
}

export async function enqueueIGMedia(job: IGMediaJob): Promise<string> {
  const q = getIGMediaQueue();
  const result = await q.add("process", job, {
    ...BASE_JOB_OPTIONS,
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    jobId: `igmedia:${job.mid}`,
  });
  return result.id ?? "";
}

export async function enqueueIGTokenRefresh(job: IGTokenJob): Promise<string> {
  const q = getIGTokenQueue();
  const result = await q.add("process", job, {
    ...BASE_JOB_OPTIONS,
    attempts: 3,
    backoff: { type: "exponential", delay: 10_000 },
    jobId: `igtoken:${job.accountId}`,
  });
  return result.id ?? "";
}

// ─── Facebook Messenger producers ─────────────────────────────────────────────

export async function enqueueFBMessage(job: FBMessageJob): Promise<string> {
  const q = getFBMMessageQueue();
  const result = await q.add("process", job, {
    ...BASE_JOB_OPTIONS,
    ...RETRY_OPTIONS,
    // Deduplicate: same Meta message ID must never be processed twice
    jobId: `fbm:${job.mid}`,
  });
  return result.id ?? "";
}

export async function enqueueFBOutbound(job: FBOutboundJob): Promise<string> {
  const q = getFBMOutboundQueue();
  const result = await q.add("process", job, {
    ...BASE_JOB_OPTIONS,
    attempts: 4,
    backoff: { type: "exponential", delay: 3_000 },
  });
  return result.id ?? "";
}
