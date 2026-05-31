import { Redis } from "ioredis";

let _redis: Redis | null = null;
let _producerRedis: Redis | null = null;

/**
 * Worker-side Redis — maxRetriesPerRequest: null required by BullMQ Worker.
 * Retries indefinitely so workers survive transient Redis restarts.
 */
export function getRedis(): Redis {
  if (_redis) return _redis;

  const url = process.env.REDIS_URL;
  if (!url) throw new Error("[redis] REDIS_URL environment variable is not set");

  _redis = new Redis(url, {
    maxRetriesPerRequest: null, // Required by BullMQ Worker
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy: (times) => Math.min(times * 200, 3_000),
  });

  _redis.on("error", (err: Error) => console.error("[redis] Connection error:", err.message));
  _redis.on("connect", () => console.info("[redis] Connected"));

  return _redis;
}

/**
 * Producer-side Redis — fails fast so Vercel server actions never hang.
 * maxRetriesPerRequest: 0 means commands throw immediately if Redis is unreachable.
 * connectTimeout: 3 s — if the TCP connection isn't established in 3 s, throw.
 */
export function getProducerRedis(): Redis {
  if (_producerRedis) return _producerRedis;

  const url = process.env.REDIS_URL;
  if (!url) throw new Error("[redis] REDIS_URL environment variable is not set");

  _producerRedis = new Redis(url, {
    maxRetriesPerRequest: 0,        // Fail immediately — don't block Vercel functions
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 3_000,          // Give up a single TCP attempt after 3 s
    // Retry indefinitely with exponential backoff capped at 3 s.
    // CRITICAL: returning null here permanently kills the singleton — all future
    // queue.add() calls throw "Connection is closed." and the webhook silently
    // drops every message until Vercel spins up a new cold instance.
    // maxRetriesPerRequest:0 already makes individual commands fail fast during
    // reconnection, so we can safely retry the socket forever in the background.
    retryStrategy: (times) => Math.min(times * 200, 3_000),
  });

  _producerRedis.on("error", (err: Error) => console.error("[redis/producer] error:", err.message));
  _producerRedis.on("connect", () => console.info("[redis/producer] connected"));

  return _producerRedis;
}

export async function closeProducerRedis(): Promise<void> {
  if (_producerRedis) { await _producerRedis.quit(); _producerRedis = null; }
}

export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}
