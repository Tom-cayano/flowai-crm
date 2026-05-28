// Redis sliding-window rate limiter.
// Used to throttle outbound messages per WhatsApp instance to prevent bans.
//
// Limits (configurable via env):
//   WPP_RATE_PER_MINUTE  — default 20 messages/min per instance
//   WPP_RATE_PER_DAY     — default 500 messages/day per instance

import type { Redis } from "ioredis";

export interface RateLimitResult {
  allowed: boolean;
  /** Remaining budget in the current window */
  remaining: number;
  /** Milliseconds until the window resets */
  retryAfterMs: number;
}

interface WindowConfig {
  limit: number;
  windowMs: number;
}

const PER_MINUTE: WindowConfig = {
  limit: Number(process.env.WPP_RATE_PER_MINUTE ?? 20),
  windowMs: 60_000,
};

const PER_DAY: WindowConfig = {
  limit: Number(process.env.WPP_RATE_PER_DAY ?? 500),
  windowMs: 86_400_000,
};

/**
 * Sliding-window rate limiter using Redis sorted sets.
 * Returns allowed=false when either window is over budget.
 * Call this BEFORE sending a message. Only increments when allowed.
 */
export async function checkRateLimit(
  redis: Redis,
  instanceName: string
): Promise<RateLimitResult> {
  const now = Date.now();

  for (const cfg of [PER_MINUTE, PER_DAY]) {
    const key = `rl:wpp:${instanceName}:${cfg.windowMs}`;
    const windowStart = now - cfg.windowMs;

    // Atomic sliding window using Lua to avoid race conditions
    const result = await redis.eval(
      SLIDING_WINDOW_SCRIPT,
      1,
      key,
      windowStart.toString(),
      now.toString(),
      cfg.limit.toString(),
      cfg.windowMs.toString()
    ) as [number, number]; // [allowed (0|1), remaining]

    const allowed   = result[0] === 1;
    const remaining = result[1];

    if (!allowed) {
      // Calculate when oldest entry exits the window
      const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
      const oldestTs = oldest.length >= 2 ? Number(oldest[1]) : now;
      const retryAfterMs = Math.max(0, oldestTs + cfg.windowMs - now);

      return { allowed: false, remaining: 0, retryAfterMs };
    }

    if (remaining === 0) {
      return { allowed: false, remaining: 0, retryAfterMs: cfg.windowMs };
    }
  }

  return { allowed: true, remaining: PER_MINUTE.limit, retryAfterMs: 0 };
}

/** Returns current usage without incrementing — for monitoring. */
export async function getRateLimitUsage(
  redis: Redis,
  instanceName: string
): Promise<{ minute: number; day: number }> {
  const now = Date.now();

  const [minuteCount, dayCount] = await Promise.all([
    redis.zcount(
      `rl:wpp:${instanceName}:${PER_MINUTE.windowMs}`,
      now - PER_MINUTE.windowMs,
      "+inf"
    ),
    redis.zcount(
      `rl:wpp:${instanceName}:${PER_DAY.windowMs}`,
      now - PER_DAY.windowMs,
      "+inf"
    ),
  ]);

  return { minute: minuteCount, day: dayCount };
}

// ─── Lua script ───────────────────────────────────────────────────────────────
// KEYS[1]   — Redis key (sorted set)
// ARGV[1]   — window start timestamp (ms)
// ARGV[2]   — current timestamp (ms, also used as score)
// ARGV[3]   — max requests in window
// ARGV[4]   — window duration in ms (for TTL)
// Returns   — [allowed (1|0), remaining]

const SLIDING_WINDOW_SCRIPT = `
local key         = KEYS[1]
local window_start = tonumber(ARGV[1])
local now         = tonumber(ARGV[2])
local limit       = tonumber(ARGV[3])
local window_ms   = tonumber(ARGV[4])

-- Remove entries outside the sliding window
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

-- Count current entries
local current = redis.call('ZCARD', key)
local remaining = limit - current - 1

if current < limit then
  -- Add this request; use now+random suffix to avoid score collisions
  redis.call('ZADD', key, now, now .. ':' .. math.random(1000000))
  redis.call('PEXPIRE', key, window_ms)
  return {1, remaining}
end

return {0, 0}
`;
