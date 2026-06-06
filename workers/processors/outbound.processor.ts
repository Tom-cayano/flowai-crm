// Outbound message processor — all sends go through here so rate limiting
// and anti-ban delays are applied consistently regardless of trigger source
// (manual, automation, campaign, AI reply).

import { createAdminClient } from "@/lib/supabase/admin";
import { evolutionSendText } from "@/lib/webhook/evolution-client";
import { checkRateLimit } from "@/lib/rate-limiter";
import {
  applyPreDelay,
  calculateDelay,
  checkWarmup,
  recordWarmupSend,
  isContactBurstBlocked,
} from "@/lib/anti-ban/strategy";
import { getRedis } from "@/lib/redis/client";
import { eventBus } from "@/lib/event-bus";
import type { OutboundJob, OutboundJobResult } from "@/lib/queue/types";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { incrementUsage } from "@/lib/billing/usage";

export async function processOutbound(job: OutboundJob): Promise<OutboundJobResult> {
  const { instanceName, serverUrl, apiKey, phone, content, conversationId, origin } = job;
  const redis = getRedis();

  // ── Anti-ban: warmup guard ────────────────────────────────────────────────
  const warmup = await checkWarmup(redis, instanceName);
  if (warmup.blocked) {
    console.warn(
      `[outbound] Warmup blocked — instance="${instanceName}"` +
      ` sentToday=${warmup.sentToday}/${warmup.dailyLimit}`
    );
    return { success: false, rateLimited: true, error: "Warmup daily limit reached" };
  }

  // ── Anti-ban: contact burst guard ────────────────────────────────────────
  const burstBlocked = await isContactBurstBlocked(redis, instanceName, phone);
  if (burstBlocked) {
    console.warn(`[outbound] Burst blocked — instance="${instanceName}" phone=${phone}`);
    return { success: false, rateLimited: true, error: "Contact burst limit reached" };
  }

  // ── Rate limiting ─────────────────────────────────────────────────────────
  const rl = await checkRateLimit(redis, instanceName);
  if (!rl.allowed) {
    const retryIn = Math.ceil(rl.retryAfterMs / 1_000);
    console.warn(`[outbound] Rate limited — retry in ${retryIn}s`);
    // BullMQ will retry this job; throwing causes the backoff to apply
    throw Object.assign(new Error(`Rate limited — retry in ${retryIn}s`), { retryAfterMs: rl.retryAfterMs });
  }

  // ── Anti-ban: human-like pre-send delay ───────────────────────────────────
  await applyPreDelay(content);

  // ── Send via Evolution API ────────────────────────────────────────────────
  const { typingMs } = calculateDelay(content);

  const result = await evolutionSendText(instanceName, serverUrl, apiKey, {
    phone,
    text: content,
    delayMs: typingMs,
  });

  if (!result.ok) {
    // Log structured error with full context so failures are diagnosable
    console.error(JSON.stringify({
      level:       "ERROR",
      event:       "outbound_send_failed",
      instance:    instanceName,
      phone,
      origin:      job.origin,
      error:       result.error,
      serverUrl:   serverUrl.replace(/\/\/[^@]+@/, "//*@"),   // redact credentials
      key_preview: (job.apiKey ?? "").slice(0, 8) + "…",
      ts:          new Date().toISOString(),
    }));
    throw new Error(`Evolution API send failed (${result.error ?? "unknown"}) — instance="${instanceName}" phone=${phone}`);
  }

  // ── Post-send ─────────────────────────────────────────────────────────────
  if (warmup.isWarmup) {
    await recordWarmupSend(redis, instanceName);
  }

  const db = createAdminClient();
  const now = new Date().toISOString();

  if (job.messageId) {
    // UI already wrote the optimistic row — just patch external_id
    await db
      .from("messages")
      .update({ external_id: result.externalId ?? null })
      .eq("id", job.messageId);
  } else {
    // Automation / campaign / AI reply — write the full row
    await db
      .from("messages")
      .insert({
        conversation_id: conversationId,
        content,
        type:            "text",
        sender:          "agent" as const,
        status:          "sent" as const,
        agent_name:      job.agentName ?? "FlowAI",
        external_id:     result.externalId ?? null,
      });

    const workspaceId = await getUserPrimaryWorkspace(job.userId);
    if (workspaceId) {
      void incrementUsage(workspaceId, "messages_sent");
    }
  }

  // Update conversation last_message fields
  await db
    .from("conversations")
    .update({
      last_message_at:      now,
      last_message_preview: content.slice(0, 120),
      last_message_sender:  "agent",
      updated_at:           now,
    })
    .eq("id", conversationId);

  // Also update message_queue row if this came from the queue
  await db
    .from("message_queue")
    .update({ status: "sent" as const, sent_at: now, updated_at: now })
    .eq("conversation_id", conversationId)
    .eq("phone", phone)
    .eq("status", "processing" as const);

  if (result.externalId) {
    eventBus.emit("message:sent", {
      instanceName,
      conversationId,
      externalId: result.externalId,
      phone,
    });
  }

  console.info(
    `[outbound] Sent — instance="${instanceName}" phone=${phone}` +
    ` externalId=${result.externalId} origin=${origin}`
  );

  return { success: true, externalId: result.externalId };
}
