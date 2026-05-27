// Lead scoring — upserts contact_scores and maintains an audit trail.

import { createAdminClient } from "@/lib/supabase/admin";
import type { LeadScoreEvent } from "@/types/automation";

interface UpsertOptions {
  userId:    string;
  contactId: string;
  delta:     number;
  reason:    string;
}

export async function upsertLeadScore({
  userId,
  contactId,
  delta,
  reason,
}: UpsertOptions): Promise<number> {
  const db = createAdminClient();

  const { data: existing } = await db
    .from("contact_scores")
    .select("score, events")
    .eq("user_id", userId)
    .eq("contact_id", contactId)
    .maybeSingle();

  const currentScore = existing?.score ?? 0;
  const currentEvents = Array.isArray(existing?.events) ? (existing.events as unknown as LeadScoreEvent[]) : [];
  const newScore = Math.max(0, currentScore + delta);

  const newEvent: LeadScoreEvent = {
    delta,
    reason,
    timestamp: new Date().toISOString(),
  };

  // Keep last 50 events to avoid unbounded growth
  const updatedEvents = [...currentEvents, newEvent].slice(-50);

  await db.from("contact_scores").upsert({
    user_id:         userId,
    contact_id:      contactId,
    score:           newScore,
    events:          updatedEvents as unknown as import("@/types/supabase").Json,
    last_updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,contact_id" });

  // Fire lead_score_threshold trigger if the score crossed a meaningful boundary.
  // Dispatched asynchronously so the scorer never blocks on trigger evaluation.
  if (delta !== 0) {
    void dispatchScoreThresholdIfNeeded(userId, contactId, newScore);
  }

  return newScore;
}

async function dispatchScoreThresholdIfNeeded(
  userId: string,
  contactId: string,
  score: number
): Promise<void> {
  try {
    const { enqueueTrigger } = await import("@/lib/queue/producers");
    // Find the most recent open conversation for this contact
    const db = createAdminClient();
    const { data: conv } = await db
      .from("conversations")
      .select("id")
      .eq("user_id", userId)
      .eq("contact_id", contactId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    await enqueueTrigger({
      type:           "lead_score_threshold",
      userId,
      conversationId: conv?.id ?? null,
      contactId,
      phone:          "",
      meta:           { score },
    });
  } catch {
    // Best-effort — never throw from score update path
  }
}

export async function getLeadScore(
  userId: string,
  contactId: string
): Promise<number> {
  const db = createAdminClient();
  const { data } = await db
    .from("contact_scores")
    .select("score")
    .eq("user_id", userId)
    .eq("contact_id", contactId)
    .maybeSingle();

  return data?.score ?? 0;
}
