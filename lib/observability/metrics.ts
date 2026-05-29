// Runtime metrics: Redis INCR counters for throughput + BullMQ queue stats aggregation.
// The worker calls captureQueueSnapshot() every 60s; the ops dashboard reads snapshots.

import type { JobType } from "bullmq";
import { getRedis } from "@/lib/redis/client";
import { createAdminClient } from "@/lib/supabase/admin";
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
import { QUEUE_NAMES } from "@/lib/queue/types";

// ─── Redis counter keys ───────────────────────────────────────────────────────

function throughputKey(queueName: string, windowHour: number): string {
  return `metrics:tp:${queueName}:${windowHour}`;
}

function latencyKey(queueName: string): string {
  return `metrics:lat:${queueName}`;
}

// ─── Increment on job complete ────────────────────────────────────────────────

export async function recordJobCompleted(
  queueName: string,
  latencyMs: number
): Promise<void> {
  const redis = getRedis();
  const hour  = Math.floor(Date.now() / 3_600_000);
  const tpKey = throughputKey(queueName, hour);

  await Promise.all([
    redis.incr(tpKey).then(() => redis.expire(tpKey, 7_200)),
    redis.lpush(latencyKey(queueName), latencyMs),
    redis.ltrim(latencyKey(queueName), 0, 999),
  ]);
}

// ─── Queue stats aggregation ──────────────────────────────────────────────────

type QueueLike = { getJobCounts: (...types: JobType[]) => Promise<Record<string, number>> };

const QUEUES: Array<{ name: string; getQueue: () => QueueLike }> = [
  { name: QUEUE_NAMES.WPP_MESSAGE,    getQueue: getMessageQueue    },
  { name: QUEUE_NAMES.WPP_STATUS,     getQueue: getStatusQueue     },
  { name: QUEUE_NAMES.WPP_MEDIA,      getQueue: getMediaQueue      },
  { name: QUEUE_NAMES.WPP_AUTOMATION, getQueue: getAutomationQueue },
  { name: QUEUE_NAMES.WPP_OUTBOUND,   getQueue: getOutboundQueue   },
  { name: QUEUE_NAMES.WPP_CONNECTION, getQueue: getConnectionQueue },
  { name: QUEUE_NAMES.WPP_SESSION,    getQueue: getSessionQueue    },
  { name: QUEUE_NAMES.WPP_SCHEDULED,  getQueue: getScheduledQueue  },
  { name: QUEUE_NAMES.WPP_TRIGGER,    getQueue: getTriggerQueue    },
];

export interface QueueSnapshot {
  queueName:    string;
  waiting:      number;
  active:       number;
  completed:    number;
  failed:       number;
  delayed:      number;
  throughput1h: number;
  avgLatencyMs: number | null;
}

async function getQueueStats(name: string, q: QueueLike): Promise<QueueSnapshot> {
  const redis  = getRedis();
  const hour   = Math.floor(Date.now() / 3_600_000);
  const counts = await q.getJobCounts("waiting", "active", "completed", "failed", "delayed");

  // Use pipeline to batch Redis reads into a single round-trip (2 commands → 1 pipeline)
  const pipeline = redis.pipeline();
  pipeline.get(throughputKey(name, hour));
  pipeline.lrange(latencyKey(name), 0, 99); // cap at 100 samples to reduce transfer
  const [[, tp], [, latencies]] = await pipeline.exec() as [[null, string | null], [null, string[]]];
  const _latencies = latencies ?? [];

  const latNums     = _latencies.map(Number).filter((n) => !isNaN(n));
  const avgLatency  = latNums.length > 0
    ? Math.round(latNums.reduce((a, b) => a + b, 0) / latNums.length)
    : null;

  return {
    queueName:    name,
    waiting:      counts.waiting   ?? 0,
    active:       counts.active    ?? 0,
    completed:    counts.completed ?? 0,
    failed:       counts.failed    ?? 0,
    delayed:      counts.delayed   ?? 0,
    throughput1h: Number(tp ?? 0),
    avgLatencyMs: avgLatency,
  };
}

export async function getAllQueueSnapshots(): Promise<QueueSnapshot[]> {
  return Promise.all(QUEUES.map(({ name, getQueue }) => getQueueStats(name, getQueue())));
}

// ─── Persist snapshot to Supabase ────────────────────────────────────────────

export async function captureQueueSnapshot(): Promise<void> {
  const snapshots = await getAllQueueSnapshots();
  const db = createAdminClient();

  await db.from("metrics_snapshots").insert(
    snapshots.map((s) => ({
      queue_name:     s.queueName,
      waiting:        s.waiting,
      active:         s.active,
      completed:      s.completed,
      failed:         s.failed,
      delayed:        s.delayed,
      throughput_1h:  s.throughput1h,
      avg_latency_ms: s.avgLatencyMs,
    }))
  );
}

// ─── TTL cleanup (called periodically by worker) ──────────────────────────────

export async function pruneOldSnapshots(): Promise<void> {
  const db  = createAdminClient();
  const cutoff = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
  await db.from("metrics_snapshots").delete().lt("captured_at", cutoff);
}

// ─── Historical data for charts ───────────────────────────────────────────────

export interface HistoricalSnapshot {
  capturedAt:   string;
  waiting:      number;
  active:       number;
  failed:       number;
  throughput1h: number;
  avgLatencyMs: number | null;
}

export async function getQueueHistory(
  queueName: string,
  hoursBack = 24
): Promise<HistoricalSnapshot[]> {
  const db     = createAdminClient();
  const cutoff = new Date(Date.now() - hoursBack * 3_600_000).toISOString();

  const { data } = await db
    .from("metrics_snapshots")
    .select("captured_at, waiting, active, failed, throughput_1h, avg_latency_ms")
    .eq("queue_name", queueName)
    .gte("captured_at", cutoff)
    .order("captured_at", { ascending: true });

  return (data ?? []).map((r) => ({
    capturedAt:   r.captured_at,
    waiting:      r.waiting,
    active:       r.active,
    failed:       r.failed,
    throughput1h: r.throughput_1h,
    avgLatencyMs: r.avg_latency_ms,
  }));
}
