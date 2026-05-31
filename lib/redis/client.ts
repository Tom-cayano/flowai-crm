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
    connectTimeout: 3_000,          // Give up connecting after 3 s
    // Allow up to 3 reconnect attempts (max ~1 s total) so transient Upstash
    // idle-timeouts don't permanently kill the singleton in warm Vercel instances.
    // After 3 failures the client gives up and the next enqueue throws fast.
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 500)),
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
