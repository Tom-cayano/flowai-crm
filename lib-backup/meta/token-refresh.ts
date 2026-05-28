// Unified token refresh orchestrator for all Meta channels.
// Schedules BullMQ refresh jobs for accounts whose tokens expire soon.
// Called from the worker cron loop (e.g. daily at 03:00 UTC).
//
// Instagram long-lived tokens expire in 60 days — refresh when < 10 days remain.
// WhatsApp Cloud system user tokens typically don't expire (never-expiring).
// Page access tokens are non-expiring by default.

import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueIGTokenRefresh } from "@/lib/queue/producers";
import { maybeRefreshToken } from "@/lib/instagram/token-store";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("token-refresh");

// Refresh Instagram accounts expiring within this many days
const IG_REFRESH_THRESHOLD_DAYS = 10;

// ─── Instagram ────────────────────────────────────────────────────────────────

/**
 * Scan all active Instagram accounts and enqueue a refresh job for any
 * token that expires within IG_REFRESH_THRESHOLD_DAYS.
 * Safe to call repeatedly — the BullMQ jobId deduplicates.
 */
export async function scheduleIGTokenRefreshes(): Promise<{ scheduled: number }> {
  const db = createAdminClient();
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + IG_REFRESH_THRESHOLD_DAYS);

  const { data: accounts, error } = await db
    .from("instagram_accounts")
    .select("id, user_id, token_expires_at, connection_state")
    .eq("is_active", true)
    .neq("connection_state", "disconnected")
    .lt("token_expires_at", threshold.toISOString());

  if (error) {
    log.error("failed to query expiring IG accounts", { error: error.message });
    return { scheduled: 0 };
  }

  const accounts_ = accounts ?? [];
  let scheduled = 0;

  for (const acc of accounts_) {
    try {
      await enqueueIGTokenRefresh({ accountId: acc.id, userId: acc.user_id, action: "refresh" });
      scheduled++;
    } catch (err) {
      log.warn("failed to enqueue IG token refresh", {
        accountId: acc.id,
        error: String(err),
      });
    }
  }

  if (scheduled > 0) {
    log.info("IG token refresh jobs scheduled", { count: scheduled });
  }

  return { scheduled };
}

/**
 * Immediately refresh a single Instagram account token (called by the worker processor).
 * Wrapper around the existing maybeRefreshToken helper for use from lib/meta/.
 */
export async function refreshIGToken(accountId: string): Promise<boolean> {
  return maybeRefreshToken(accountId, IG_REFRESH_THRESHOLD_DAYS);
}

// ─── WhatsApp Cloud ───────────────────────────────────────────────────────────

/**
 * WhatsApp Cloud system user tokens typically never expire.
 * If token_expires_at IS set (manually rotated tokens), this will log warnings.
 * Full rotation must be done via Meta Business Suite — no auto-refresh API.
 */
export async function checkWACTokenHealth(): Promise<{ expiringSoon: number }> {
  const db = createAdminClient();
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + 7);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: accounts } = await (db as any)
    .from("whatsapp_cloud_accounts")
    .select("id, phone_number_id, token_expires_at, connection_state")
    .eq("is_active", true)
    .not("token_expires_at", "is", null)
    .lt("token_expires_at", threshold.toISOString()) as {
      data: Array<{ id: string; phone_number_id: string; token_expires_at: string | null; connection_state: string }> | null
    };

  const expiringSoon = (accounts ?? []).length;

  if (expiringSoon > 0) {
    log.warn("WhatsApp Cloud tokens expiring soon — rotate manually in Meta Business Suite", {
      count: expiringSoon,
      ids:   (accounts ?? []).map((a) => a.phone_number_id),
    });
  }

  return { expiringSoon };
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Run all channel token refresh checks.
 * Call from the worker cron loop once per hour.
 */
export async function runTokenRefreshCycle(): Promise<void> {
  const [ig, wac] = await Promise.allSettled([
    scheduleIGTokenRefreshes(),
    checkWACTokenHealth(),
  ]);

  if (ig.status === "rejected")  log.error("IG refresh cycle failed",  { error: String(ig.reason) });
  if (wac.status === "rejected") log.error("WAC health check failed",   { error: String(wac.reason) });
}
