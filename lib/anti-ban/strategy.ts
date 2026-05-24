// Anti-ban strategy for WhatsApp multi-tenant SaaS.
//
// WhatsApp bans numbers that exhibit bot-like behaviour:
//   • Sending too many messages too quickly
//   • Identical timing patterns between messages
//   • No typing simulation before replies
//   • High volume on a freshly-connected number (cold number)
//
// This module provides delays and policies the outbound processor must apply
// before every Evolution API send call.

import type { Redis } from "ioredis";

// ─── Configuration ────────────────────────────────────────────────────────────

// Base delay in ms between consecutive messages to the same instance.
const MIN_DELAY_MS  = Number(process.env.WPP_ANTI_BAN_MIN_MS  ?? 800);
const MAX_DELAY_MS  = Number(process.env.WPP_ANTI_BAN_MAX_MS  ?? 3_500);

// Typing simulation: approximately 60 chars/second, clamped to [1s, 5s].
const CHARS_PER_SEC = 60;
const MIN_TYPING_MS = 1_000;
const MAX_TYPING_MS = 5_000;

// Warmup period: new numbers are restricted for 7 days.
const WARMUP_DAYS      = 7;
const WARMUP_MAX_PER_DAY = Number(process.env.WPP_WARMUP_MAX_DAILY ?? 30);

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface DelayPolicy {
  /** Milliseconds to wait before calling Evolution API sendText. */
  preDelay: number;
  /**
   * Milliseconds of typing simulation to pass to Evolution API as `delay`.
   * Evolution shows "typing…" in the recipient's app for this duration.
   */
  typingMs: number;
}

export interface WarmupStatus {
  /** True if this instance is still in warmup period. */
  isWarmup: boolean;
  /** Messages allowed today under the warmup policy. */
  dailyLimit: number;
  /** Messages sent today according to Redis. */
  sentToday: number;
  /** Whether the daily limit has been reached. */
  blocked: boolean;
}

// ─── Delay calculator ─────────────────────────────────────────────────────────

/**
 * Calculates how long to wait before sending a message and how long Evolution
 * should simulate typing. Both values are randomised to appear human-like.
 */
export function calculateDelay(content: string): DelayPolicy {
  // Random base delay
  const preDelay = jitter(MIN_DELAY_MS, MAX_DELAY_MS);

  // Typing proportional to message length, with jitter ±20 %
  const rawTyping = Math.round((content.length / CHARS_PER_SEC) * 1_000);
  const typingMs  = clamp(
    Math.round(rawTyping * (0.8 + Math.random() * 0.4)),
    MIN_TYPING_MS,
    MAX_TYPING_MS
  );

  return { preDelay, typingMs };
}

/** Returns a Promise that resolves after the pre-send delay. */
export function applyPreDelay(content: string): Promise<void> {
  const { preDelay } = calculateDelay(content);
  return sleep(preDelay);
}

// ─── Warmup guard ─────────────────────────────────────────────────────────────

/**
 * Checks whether an instance is in the warmup period and whether the daily
 * message limit has been reached. Uses Redis to track daily send counts.
 */
export async function checkWarmup(
  redis: Redis,
  instanceName: string
): Promise<WarmupStatus> {
  const registrationKey = `warmup:registered:${instanceName}`;
  const dailyKey        = `warmup:daily:${instanceName}:${utcDateKey()}`;

  // Determine registration date
  let registeredAt = await redis.get(registrationKey);
  if (!registeredAt) {
    // First time we see this instance — set its registration timestamp.
    registeredAt = Date.now().toString();
    await redis.set(registrationKey, registeredAt, "EX", WARMUP_DAYS * 86_400);
  }

  const daysSinceRegistration =
    (Date.now() - Number(registeredAt)) / (1_000 * 86_400);
  const isWarmup = daysSinceRegistration < WARMUP_DAYS;

  if (!isWarmup) {
    return { isWarmup: false, dailyLimit: Infinity, sentToday: 0, blocked: false };
  }

  const sentToday = Number(await redis.get(dailyKey) ?? 0);
  const blocked   = sentToday >= WARMUP_MAX_PER_DAY;

  return { isWarmup: true, dailyLimit: WARMUP_MAX_PER_DAY, sentToday, blocked };
}

/** Increments the daily counter after a successful send during warmup. */
export async function recordWarmupSend(
  redis: Redis,
  instanceName: string
): Promise<void> {
  const dailyKey = `warmup:daily:${instanceName}:${utcDateKey()}`;
  await redis.incr(dailyKey);
  // TTL = 25 hours so the key auto-cleans
  await redis.expire(dailyKey, 90_000);
}

// ─── Contact-level burst guard ────────────────────────────────────────────────

/**
 * Prevents sending more than `maxPerHour` messages to the SAME contact
 * within a rolling hour. Returns true if blocked.
 */
export async function isContactBurstBlocked(
  redis: Redis,
  instanceName: string,
  phone: string,
  maxPerHour = 10
): Promise<boolean> {
  const key      = `burst:${instanceName}:${phone}`;
  const now      = Date.now();
  const windowMs = 3_600_000;

  await redis.zremrangebyscore(key, "-inf", now - windowMs);
  const count = await redis.zcard(key);

  if (count >= maxPerHour) return true;

  await redis.zadd(key, now, `${now}:${Math.random()}`);
  await redis.pexpire(key, windowMs);

  return false;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function jitter(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function utcDateKey(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}
