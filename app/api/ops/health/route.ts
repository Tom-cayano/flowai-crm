import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRedis } from "@/lib/redis/client";
import { validateEnv, getChannelCapabilities } from "@/lib/env";

export const dynamic = "force-dynamic";

interface HealthStatus {
  status:   "healthy" | "degraded" | "unhealthy";
  redis:    { ok: boolean; latencyMs: number };
  supabase: { ok: boolean; latencyMs: number };
  workers:  {
    alive:       number;
    stale:       number;
    details:     Array<{ workerId: string; lastBeat: string; queues: string[] }>;
  };
  config: {
    env:          { ok: boolean; missing: string[]; warnings: string[] };
    channels:     Record<string, boolean>;
  };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();
  const redis = getRedis();
  const STALE_THRESHOLD_MS = 90_000; // 90s — heartbeat every 30s, 3x grace

  // Redis ping
  const redisStart = Date.now();
  let redisOk = false;
  try {
    await redis.ping();
    redisOk = true;
  } catch { /* intentional */ }
  const redisLatency = Date.now() - redisStart;

  // Supabase ping
  const sbStart = Date.now();
  let sbOk = false;
  try {
    const { error } = await db.from("worker_heartbeats").select("id").limit(1);
    sbOk = !error;
  } catch { /* intentional */ }
  const sbLatency = Date.now() - sbStart;

  // Worker heartbeats
  const { data: beats } = await db
    .from("worker_heartbeats")
    .select("worker_id, last_beat, queues")
    .order("last_beat", { ascending: false });

  const now = Date.now();
  const alive: typeof beats = [];
  const stale: typeof beats = [];

  for (const b of beats ?? []) {
    const age = now - new Date(b.last_beat).getTime();
    if (age < STALE_THRESHOLD_MS) alive.push(b);
    else stale.push(b);
  }

  const overallStatus: HealthStatus["status"] =
    !redisOk || !sbOk ? "unhealthy"
    : stale.length > 0 || alive.length === 0 ? "degraded"
    : "healthy";

  const envReport    = validateEnv();
  const capabilities = getChannelCapabilities();

  const health: HealthStatus = {
    status: overallStatus,
    redis:    { ok: redisOk, latencyMs: redisLatency },
    supabase: { ok: sbOk,    latencyMs: sbLatency },
    workers: {
      alive: alive.length,
      stale: stale.length,
      details: (beats ?? []).map((b) => ({
        workerId: b.worker_id,
        lastBeat: b.last_beat,
        queues:   b.queues,
      })),
    },
    config: {
      env:      { ok: envReport.ok, missing: envReport.missing, warnings: envReport.warnings },
      channels: capabilities as unknown as Record<string, boolean>,
    },
  };

  const httpStatus = overallStatus === "unhealthy" ? 503 : 200;
  return NextResponse.json(health, { status: httpStatus });
}
