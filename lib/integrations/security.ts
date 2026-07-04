// Security layer for the universal webhook endpoint.
//
//   • Rate limiting     — Redis fixed-window counters (per IP + per integration)
//   • HMAC verification — x-flowai-signature: sha256 hex of the raw body
//   • Attempt logging   — failed auth attempts persisted for the panel
//
// Rate limits fail OPEN: if Redis is unreachable the request proceeds —
// losing a lead is worse than momentarily losing rate limiting.

import { createHmac, timingSafeEqual } from "node:crypto";
import { getProducerRedis } from "@/lib/redis/client";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SecurityReason } from "./types";

// ─── Rate limiting ────────────────────────────────────────────────────────────

const LIMITS = {
  /** Requests per IP per minute across the whole endpoint. */
  perIp:          Number(process.env.WEBHOOK_RATE_LIMIT_IP          ?? 300),
  /** Accepted events per integration per minute. */
  perIntegration: Number(process.env.WEBHOOK_RATE_LIMIT_INTEGRATION ?? 120),
  /** Failed auth attempts per IP per minute before blocking. */
  authFailures:   Number(process.env.WEBHOOK_RATE_LIMIT_AUTH_FAIL   ?? 20),
} as const;

async function incrWindow(key: string, windowSeconds: number): Promise<number> {
  const redis = getProducerRedis();
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSeconds);
  return count;
}

/** Returns true when the request must be rejected with 429. */
export async function isIpRateLimited(ip: string): Promise<boolean> {
  try {
    return (await incrWindow(`wh:rl:ip:${ip}`, 60)) > LIMITS.perIp;
  } catch {
    return false; // fail open
  }
}

/** Returns true when the integration exceeded its per-minute budget. */
export async function isIntegrationRateLimited(integrationId: string): Promise<boolean> {
  try {
    return (await incrWindow(`wh:rl:int:${integrationId}`, 60)) > LIMITS.perIntegration;
  } catch {
    return false;
  }
}

/**
 * Tracks failed auth attempts per IP. Once the threshold is crossed the IP
 * is blocked for the rest of the window (brute-force protection).
 */
export async function registerAuthFailure(ip: string): Promise<{ blocked: boolean }> {
  try {
    const count = await incrWindow(`wh:rl:authfail:${ip}`, 300);
    return { blocked: count > LIMITS.authFailures };
  } catch {
    return { blocked: false };
  }
}

export async function isAuthBlocked(ip: string): Promise<boolean> {
  try {
    const redis = getProducerRedis();
    const count = Number((await redis.get(`wh:rl:authfail:${ip}`)) ?? 0);
    return count > LIMITS.authFailures;
  } catch {
    return false;
  }
}

// ─── HMAC signature ───────────────────────────────────────────────────────────

/**
 * Verifies x-flowai-signature — hex-encoded HMAC-SHA256 of the raw request
 * body. Accepts an optional "sha256=" prefix (GitHub/Meta convention).
 */
export function verifyHmacSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;

  const provided = signatureHeader.replace(/^sha256=/i, "").trim();
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Computes the signature a sender must attach — used by the "send test" API. */
export function computeHmacSignature(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

// ─── Security event logging ───────────────────────────────────────────────────

export async function recordSecurityEvent(opts: {
  reason:         SecurityReason;
  ip:             string | null;
  detail?:        string;
  integrationId?: string | null;
  userId?:        string | null;
}): Promise<void> {
  try {
    const db = createAdminClient();
    await db.from("integration_security_events").insert({
      reason:         opts.reason,
      ip:             opts.ip,
      detail:         opts.detail ?? null,
      integration_id: opts.integrationId ?? null,
      user_id:        opts.userId ?? null,
    });
  } catch (err) {
    console.error("[integrations/security] Failed to record security event:", err);
  }
}
