#!/usr/bin/env tsx
// FlowAI CRM — WhatsApp + Automation background worker
//
// Starts BullMQ workers for all engine queues and runs periodic background jobs.
// Run with: npx tsx workers/worker.ts
//           or: node --import tsx/esm workers/worker.ts (production)
//
// Required environment variables:
//   REDIS_URL                  — e.g. "redis://localhost:6379"
//   NEXT_PUBLIC_SUPABASE_URL   — Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY  — Service role key (bypasses RLS)
//   EVOLUTION_SERVER_URL       — Fallback Evolution API URL (dev only)
//   EVOLUTION_API_KEY          — Fallback Evolution API key (dev only)
//   EVOLUTION_FALLBACK_USER_ID — Fallback user UUID (dev only)
//
// Optional:
//   AUTOMATION_RATE_MAX        — max executions/automation/conv/hour (default 20)
//   WORKER_CONCURRENCY_*       — per-queue concurrency overrides
//   SESSION_HEALTH_INTERVAL_MS — session health check interval (default 300000)
//   CRON_RUNNER_INTERVAL_MS    — cron + timeout check interval (default 60000)
//   METRICS_INTERVAL_MS        — queue metrics snapshot interval (default 60000)
//   LOG_LEVEL                  — debug | info | warn | error (default info)

import { hostname } from "os";
import { Worker, type Job } from "bullmq";
import { getRedis, closeRedis } from "@/lib/redis/client";
import { QUEUE_NAMES } from "@/lib/queue/types";
import { runSessionHealthCheck } from "@/lib/session/monitor";
import { runCronAutomations, runNoResponseTimeouts } from "@/lib/automation/cron-runner";
import { createLogger } from "@/lib/observability/logger";
import { recordFailure } from "@/lib/observability/dlq";
import { captureQueueSnapshot, pruneOldSnapshots, recordJobCompleted } from "@/lib/observability/metrics";
import { createAdminClient } from "@/lib/supabase/admin";

import { processMessage }    from "./processors/message.processor.js";
import { processStatus }     from "./processors/status.processor.js";
import { processMedia }      from "./processors/media.processor.js";
import { processAutomation } from "./processors/automation.processor.js";
import { processOutbound }   from "./processors/outbound.processor.js";
import { processConnection } from "./processors/connection.processor.js";
import { processSession }    from "./processors/session.processor.js";
import { processScheduled }  from "./processors/scheduled.processor.js";
import { processTrigger }    from "./processors/trigger.processor.js";
import { processAI }         from "./processors/ai.processor.js";
import { processIGMessage }         from "./processors/instagram-message.processor.js";
import { processIGOutbound }        from "./processors/instagram-outbound.processor.js";
import { processIGComment }         from "./processors/instagram-comment.processor.js";
import { maybeRefreshToken }        from "@/lib/instagram/token-store";
import { processMessengerMessage }  from "./processors/messenger-message.processor.js";
import { processMessengerOutbound } from "./processors/messenger-outbound.processor.js";

import type {
  MessageJob, StatusJob, MediaJob, AutomationJob,
  OutboundJob, ConnectionJob, SessionJob, ScheduledJob, TriggerJob, AIJob,
  IGMessageJob, IGOutboundJob, IGCommentJob, IGMediaJob, IGTokenJob,
  FBMessageJob, FBOutboundJob,
} from "@/lib/queue/types";

// ─── Identity ─────────────────────────────────────────────────────────────────

const WORKER_ID      = `${hostname()}:${process.pid}`;
const WORKER_VERSION = process.env.npm_package_version ?? "dev";
const log            = createLogger("worker");

// ─── Concurrency ──────────────────────────────────────────────────────────────

const CONCURRENCY = {
  message:    Number(process.env.WORKER_CONCURRENCY_MESSAGE    ?? 5),
  status:     Number(process.env.WORKER_CONCURRENCY_STATUS     ?? 10),
  media:      Number(process.env.WORKER_CONCURRENCY_MEDIA      ?? 3),
  automation: Number(process.env.WORKER_CONCURRENCY_AUTOMATION ?? 3),
  outbound:   Number(process.env.WORKER_CONCURRENCY_OUTBOUND   ?? 2),
  connection: Number(process.env.WORKER_CONCURRENCY_CONNECTION ?? 5),
  session:    Number(process.env.WORKER_CONCURRENCY_SESSION    ?? 2),
  scheduled:  Number(process.env.WORKER_CONCURRENCY_SCHEDULED  ?? 5),
  trigger:    Number(process.env.WORKER_CONCURRENCY_TRIGGER    ?? 5),
  ai:         Number(process.env.WORKER_CONCURRENCY_AI         ?? 3),
  // Instagram — DM sends are rate-limited by Meta, keep outbound concurrency low
  igMessage:   Number(process.env.WORKER_CONCURRENCY_IG_MESSAGE  ?? 5),
  igOutbound:  Number(process.env.WORKER_CONCURRENCY_IG_OUTBOUND ?? 1),
  igComment:   Number(process.env.WORKER_CONCURRENCY_IG_COMMENT  ?? 3),
  igMedia:     Number(process.env.WORKER_CONCURRENCY_IG_MEDIA    ?? 3),
  igToken:     Number(process.env.WORKER_CONCURRENCY_IG_TOKEN    ?? 1),
  // Facebook Messenger
  fbmMessage:  Number(process.env.WORKER_CONCURRENCY_FBM_MESSAGE  ?? 5),
  fbmOutbound: Number(process.env.WORKER_CONCURRENCY_FBM_OUTBOUND ?? 2),
};

// ─── Worker factory ───────────────────────────────────────────────────────────

function createWorker<T>(
  name: string,
  processor: (job: Job<T>) => Promise<unknown>,
  concurrency: number
): Worker<T> {
  const qlog   = log.child({ queue: name });
  const worker = new Worker<T>(name, processor, {
    connection: getRedis(),
    concurrency,
  });

  worker.on("completed", (job) => {
    // job.timestamp is the enqueue time (epoch ms set by BullMQ on add)
    const latencyMs = Date.now() - (job.timestamp ?? Date.now());
    qlog.info("completed", { jobId: job.id, latencyMs });
    void recordJobCompleted(name, latencyMs);
  });

  worker.on("failed", (job, err) => {
    // BullMQ fires "failed" for every attempt failure, including intermediate retries.
    // Only write to DLQ when all attempts are exhausted (no more retries will run).
    const maxAttempts = job?.opts?.attempts ?? 1;
    const made        = job?.attemptsMade   ?? 0;
    const exhausted   = made >= maxAttempts;

    qlog.error("failed", {
      jobId: job?.id,
      attempt: made,
      maxAttempts,
      exhausted,
      error: err.message,
    });

    if (job && exhausted) {
      void recordFailure({
        queueName:    name,
        jobId:        job.id ?? "",
        jobName:      job.name,
        data:         job.data,
        opts:         job.opts,
        error:        err.message,
        stackTrace:   err.stack ?? "",
        attemptsMade: made,
        // Extract userId from job payload when present (best-effort, no throw)
        userId: extractUserId(job.data),
      });
    }
  });

  worker.on("stalled", (jobId) =>
    qlog.warn("stalled", { jobId })
  );

  worker.on("error", (err) =>
    qlog.error("worker error", { error: err.message, stack: err.stack })
  );

  return worker;
}

function extractUserId(data: unknown): string | undefined {
  if (data !== null && typeof data === "object") {
    const v = (data as Record<string, unknown>).userId;
    if (typeof v === "string") return v;
  }
  return undefined;
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  log.info("starting FlowAI engine", {
    workerId: WORKER_ID,
    version:  WORKER_VERSION,
    redis:    (process.env.REDIS_URL ?? "(no REDIS_URL)").replace(/:\/\/.+@/, "://***@"),
  });

  // ── BullMQ workers ─────────────────────────────────────────────────────────

  const workers = [
    // WhatsApp
    createWorker<MessageJob>   (QUEUE_NAMES.WPP_MESSAGE,    (j) => processMessage(j.data),    CONCURRENCY.message),
    createWorker<StatusJob>    (QUEUE_NAMES.WPP_STATUS,     (j) => processStatus(j.data),     CONCURRENCY.status),
    createWorker<MediaJob>     (QUEUE_NAMES.WPP_MEDIA,      (j) => processMedia(j.data),      CONCURRENCY.media),
    createWorker<AutomationJob>(QUEUE_NAMES.WPP_AUTOMATION, (j) => processAutomation(j.data), CONCURRENCY.automation),
    createWorker<OutboundJob>  (QUEUE_NAMES.WPP_OUTBOUND,   (j) => processOutbound(j.data),   CONCURRENCY.outbound),
    createWorker<ConnectionJob>(QUEUE_NAMES.WPP_CONNECTION, (j) => processConnection(j.data), CONCURRENCY.connection),
    createWorker<SessionJob>   (QUEUE_NAMES.WPP_SESSION,    (j) => processSession(j.data),    CONCURRENCY.session),
    createWorker<ScheduledJob> (QUEUE_NAMES.WPP_SCHEDULED,  (j) => processScheduled(j.data),  CONCURRENCY.scheduled),
    createWorker<TriggerJob>   (QUEUE_NAMES.WPP_TRIGGER,    (j) => processTrigger(j.data),    CONCURRENCY.trigger),
    createWorker<AIJob>        (QUEUE_NAMES.WPP_AI,         (j) => processAI(j.data),          CONCURRENCY.ai),
    // Instagram
    createWorker<IGMessageJob> (QUEUE_NAMES.IGM_MESSAGE,    (j) => processIGMessage(j.data),  CONCURRENCY.igMessage),
    createWorker<IGOutboundJob>(QUEUE_NAMES.IGM_OUTBOUND,   (j) => processIGOutbound(j.data), CONCURRENCY.igOutbound),
    createWorker<IGCommentJob> (QUEUE_NAMES.IGM_COMMENT,    (j) => processIGComment(j.data),  CONCURRENCY.igComment),
    // igm:media and igm:token share the same no-op stub until dedicated processors
    // are needed — DLQ catches any jobs that land there in the meantime.
    createWorker<IGMediaJob>   (QUEUE_NAMES.IGM_MEDIA,      async () => { /* stub — media stored from message processor */ }, CONCURRENCY.igMedia),
    createWorker<IGTokenJob>   (QUEUE_NAMES.IGM_TOKEN,      (j) => maybeRefreshToken(j.data.accountId),                      CONCURRENCY.igToken),
    // Facebook Messenger
    createWorker<FBMessageJob> (QUEUE_NAMES.FBM_MESSAGE,    (j) => processMessengerMessage(j.data),  CONCURRENCY.fbmMessage),
    createWorker<FBOutboundJob>(QUEUE_NAMES.FBM_OUTBOUND,   (j) => processMessengerOutbound(j.data), CONCURRENCY.fbmOutbound),
  ];

  log.info("queues online", { queues: Object.values(QUEUE_NAMES) });

  // ── Interval config ────────────────────────────────────────────────────────

  const HEARTBEAT_MS      = 30_000;
  const METRICS_MS        = Number(process.env.METRICS_INTERVAL_MS        ?? 60_000);
  const SESSION_HEALTH_MS = Number(process.env.SESSION_HEALTH_INTERVAL_MS ?? 300_000);
  const CRON_RUNNER_MS    = Number(process.env.CRON_RUNNER_INTERVAL_MS    ?? 60_000);

  // ── Heartbeat ──────────────────────────────────────────────────────────────

  const db        = createAdminClient();
  const allQueues = Object.values(QUEUE_NAMES);

  // Register this worker instance on startup (upsert so restart is idempotent)
  await db.from("worker_heartbeats").upsert(
    {
      worker_id:  WORKER_ID,
      queues:     allQueues,
      started_at: new Date().toISOString(),
      last_beat:  new Date().toISOString(),
      version:    WORKER_VERSION,
    },
    { onConflict: "worker_id" }
  );
  log.info("heartbeat registered", { workerId: WORKER_ID });

  const heartbeatTimer = setInterval(async () => {
    try {
      const { error } = await db
        .from("worker_heartbeats")
        .update({ last_beat: new Date().toISOString() })
        .eq("worker_id", WORKER_ID);
      if (error) log.warn("heartbeat write error", { error: error.message });
    } catch (err) {
      log.warn("heartbeat write threw", { error: String(err) });
    }
  }, HEARTBEAT_MS);

  // ── Queue metrics + cleanup ────────────────────────────────────────────────

  const metricsTimer = setInterval(async () => {
    const results = await Promise.allSettled([
      captureQueueSnapshot(),
      pruneOldSnapshots(),
    ]);
    for (const r of results) {
      if (r.status === "rejected") {
        log.warn("metrics tick error", { error: String(r.reason) });
      }
    }
  }, METRICS_MS);

  // ── Session health ─────────────────────────────────────────────────────────

  const healthTimer = setInterval(async () => {
    try {
      const reports  = await runSessionHealthCheck();
      const repaired = reports.filter((r) => r.wasRepaired).length;
      if (repaired > 0) {
        log.info("sessions repaired", { repaired, total: reports.length });
      }
    } catch (err) {
      log.error("session health check failed", { error: String(err) });
    }
  }, SESSION_HEALTH_MS);

  // ── Cron runner ────────────────────────────────────────────────────────────

  const cronTimer = setInterval(async () => {
    const results = await Promise.allSettled([
      runCronAutomations(),
      runNoResponseTimeouts(),
    ]);
    for (const r of results) {
      if (r.status === "rejected") {
        log.error("cron tick error", { error: String(r.reason) });
      }
    }
  }, CRON_RUNNER_MS);

  // ── Graceful shutdown ──────────────────────────────────────────────────────

  async function shutdown(signal: string): Promise<void> {
    log.info(`${signal} received — shutting down`);

    // Stop all periodic jobs first so no new work is queued
    clearInterval(heartbeatTimer);
    clearInterval(metricsTimer);
    clearInterval(healthTimer);
    clearInterval(cronTimer);

    // Drain BullMQ workers (waits for in-flight jobs to finish)
    await Promise.allSettled(workers.map((w) => w.close()));

    // Remove heartbeat row so the ops dashboard doesn't show stale entries
    await db.from("worker_heartbeats").delete().eq("worker_id", WORKER_ID);

    await closeRedis();
    log.info("shutdown complete");
    process.exit(0);
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT",  () => void shutdown("SIGINT"));

  process.on("uncaughtException", (err) => {
    log.error("uncaught exception", { error: err.message, stack: err.stack });
  });

  process.on("unhandledRejection", (reason) => {
    log.error("unhandled rejection", { reason: String(reason) });
  });

  log.info("ready — waiting for jobs");
}

start().catch((err) => {
  // Logger may not be initialised yet; fall back to stderr
  process.stderr.write(`[worker] fatal startup error: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
