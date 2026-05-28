// GET /api/ops/queue-test
//
// Tests Redis connectivity and enqueues a test job to verify the full pipeline.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const redisUrl = process.env.REDIS_URL ?? "";

  const result: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    redis: {
      urlPresent: !!redisUrl,
      urlLength: redisUrl.length,
      urlPrefix: redisUrl.slice(0, 20) + "…",
    },
  };

  if (!redisUrl) {
    return NextResponse.json({ ...result, error: "REDIS_URL not set" }, { status: 500 });
  }

  // Test direct ioredis connection
  try {
    const { Redis } = await import("ioredis");
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 5_000,
    });

    const pingStart = Date.now();
    const ping = await redis.ping();
    const pingMs = Date.now() - pingStart;

    result.redis = { ...result.redis as object, ping, pingMs, ok: true };

    // Try to enqueue a test job via BullMQ
    try {
      const { Queue } = await import("bullmq");
      const q = new Queue("wpp:message", { connection: redis });
      const job = await q.add("test", { test: true, ts: Date.now() }, {
        jobId: `health-check-${Date.now()}`,
        removeOnComplete: { age: 60 },
        removeOnFail: { age: 60 },
      });
      result.bullmq = { ok: true, jobId: job.id };
      await q.close();
    } catch (bullErr) {
      result.bullmq = { ok: false, error: String(bullErr) };
    }

    await redis.quit();
  } catch (redisErr) {
    result.redis = { ...result.redis as object, ok: false, error: String(redisErr) };
  }

  return NextResponse.json(result);
}
