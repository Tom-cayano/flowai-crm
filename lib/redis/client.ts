import { Redis } from "ioredis";

let _redis: Redis | null = null;

/** Shared Redis singleton — safe to call multiple times. */
export function getRedis(): Redis {
  if (_redis) return _redis;

  const url = process.env.REDIS_URL;
  if (!url) throw new Error("[redis] REDIS_URL environment variable is not set");

  _redis = new Redis(url, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy: (times) => Math.min(times * 200, 3_000),
  });

  _redis.on("error", (err: Error) => {
    console.error("[redis] Connection error:", err.message);
  });

  _redis.on("connect", () => {
    console.info("[redis] Connected");
  });

  return _redis;
}

export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}
