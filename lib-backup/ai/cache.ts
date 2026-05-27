// Redis-backed AI result cache. TTL-keyed so stale analysis never blocks the UI.
// Every AI lib module that produces expensive structured results calls these helpers.

import { getRedis } from "@/lib/redis/client";

const DEFAULT_TTL_SECONDS = 300; // 5 minutes — enough for a copilot session

export async function getCachedAI<T>(key: string): Promise<T | null> {
  try {
    const raw = await getRedis().get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function setCachedAI<T>(
  key:  string,
  value: T,
  ttl   = DEFAULT_TTL_SECONDS
): Promise<void> {
  try {
    await getRedis().set(key, JSON.stringify(value), "EX", ttl);
  } catch {
    // Cache write failure must never interrupt the calling pipeline
  }
}

export async function invalidateCachedAI(key: string): Promise<void> {
  try {
    await getRedis().del(key);
  } catch { /* intentional */ }
}

// Canonical key builders — keep consistent across lib and API routes
export const aiKey = {
  intelligence:  (convId: string) => `ai:intel:${convId}`,
  salesIntel:    (convId: string) => `ai:sales:${convId}`,
  suggestions:   (convId: string) => `ai:sugg:${convId}`,
  knowledge:     (userId: string, q: string) => `ai:kb:${userId}:${q.slice(0, 64)}`,
};
