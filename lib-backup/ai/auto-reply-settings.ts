// lib/ai/auto-reply-settings.ts
// Reads and caches ai_auto_reply_settings per user.
// Cache TTL = 60s (Redis) so config changes propagate quickly without hammering DB.
// Returns safe defaults when no row exists (mode = "suggest" = non-breaking).

import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedAI, setCachedAI } from "./cache";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AutoReplyMode = "off" | "suggest" | "approval" | "full_auto";

export interface AutoReplySettings {
  mode:                AutoReplyMode;
  autoSendThreshold:   number;   // 0–1 — confidence ≥ this → auto-send
  approvalThreshold:   number;   // 0–1 — confidence ≥ this → draft for approval
  blockedIntents:      string[]; // intent labels blocked from auto-reply
  cooldownSeconds:     number;   // min gap between AI replies per conversation
  dailyAutoLimit:      number;   // max AI sends/conversation/day
  activeHoursStart:    string | null;  // "HH:MM" in activeTimezone
  activeHoursEnd:      string | null;
  activeTimezone:      string;
  activeChannels:      string[]; // "whatsapp" | "instagram" | "messenger"
  promptId:            string | null;
}

// ─── Defaults (applied when no settings row exists) ───────────────────────────
// "suggest" keeps existing behaviour — chips below input, nothing auto-sent.

const DEFAULTS: AutoReplySettings = {
  mode:              "suggest",
  autoSendThreshold: 0.9,
  approvalThreshold: 0.7,
  blockedIntents:    [],
  cooldownSeconds:   30,
  dailyAutoLimit:    50,
  activeHoursStart:  null,
  activeHoursEnd:    null,
  activeTimezone:    "UTC",
  activeChannels:    ["whatsapp"],
  promptId:          null,
};

const CACHE_TTL = 60; // seconds
const cacheKey = (userId: string) => `ai:settings:${userId}`;

// ─── Public API ───────────────────────────────────────────────────────────────

/** Resolve settings for a user — cached for 60s. */
export async function getAutoReplySettings(
  userId: string
): Promise<AutoReplySettings> {
  const key    = cacheKey(userId);
  const cached = await getCachedAI<AutoReplySettings>(key);
  if (cached) return cached;

  const db     = createAdminClient();
  const { data } = await (db as any)
    .from("ai_auto_reply_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    // Cache the defaults too so repeat calls don't hit DB
    await setCachedAI(key, DEFAULTS, CACHE_TTL);
    return DEFAULTS;
  }

  const settings: AutoReplySettings = {
    mode:              (data.mode as AutoReplyMode) ?? DEFAULTS.mode,
    autoSendThreshold: Number(data.auto_send_threshold ?? DEFAULTS.autoSendThreshold),
    approvalThreshold: Number(data.approval_threshold  ?? DEFAULTS.approvalThreshold),
    blockedIntents:    (data.blocked_intents as string[]) ?? [],
    cooldownSeconds:   data.cooldown_seconds  ?? DEFAULTS.cooldownSeconds,
    dailyAutoLimit:    data.daily_auto_limit  ?? DEFAULTS.dailyAutoLimit,
    activeHoursStart:  data.active_hours_start ?? null,
    activeHoursEnd:    data.active_hours_end   ?? null,
    activeTimezone:    data.active_timezone    ?? "UTC",
    activeChannels:    (data.active_channels as string[]) ?? ["whatsapp"],
    promptId:          data.prompt_id ?? null,
  };

  await setCachedAI(key, settings, CACHE_TTL);
  return settings;
}

/** Upsert settings for a user and bust the cache. */
export async function upsertAutoReplySettings(
  userId: string,
  patch:  Partial<AutoReplySettings>
): Promise<AutoReplySettings> {
  const db = createAdminClient();

  const dbPatch: Record<string, unknown> = {
    user_id:    userId,
    updated_at: new Date().toISOString(),
  };

  if (patch.mode              !== undefined) dbPatch.mode               = patch.mode;
  if (patch.autoSendThreshold !== undefined) dbPatch.auto_send_threshold = patch.autoSendThreshold;
  if (patch.approvalThreshold !== undefined) dbPatch.approval_threshold  = patch.approvalThreshold;
  if (patch.blockedIntents    !== undefined) dbPatch.blocked_intents     = patch.blockedIntents;
  if (patch.cooldownSeconds   !== undefined) dbPatch.cooldown_seconds    = patch.cooldownSeconds;
  if (patch.dailyAutoLimit    !== undefined) dbPatch.daily_auto_limit    = patch.dailyAutoLimit;
  if (patch.activeHoursStart  !== undefined) dbPatch.active_hours_start  = patch.activeHoursStart;
  if (patch.activeHoursEnd    !== undefined) dbPatch.active_hours_end    = patch.activeHoursEnd;
  if (patch.activeTimezone    !== undefined) dbPatch.active_timezone     = patch.activeTimezone;
  if (patch.activeChannels    !== undefined) dbPatch.active_channels     = patch.activeChannels;
  if (patch.promptId          !== undefined) dbPatch.prompt_id           = patch.promptId;

  await (db as any)
    .from("ai_auto_reply_settings")
    .upsert(dbPatch, { onConflict: "user_id" });

  // Bust cache so next read fetches fresh row
  const { invalidateCachedAI } = await import("./cache");
  await invalidateCachedAI(cacheKey(userId));

  return getAutoReplySettings(userId);
}
