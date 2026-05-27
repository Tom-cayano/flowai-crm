// lib/ai/auto-reply-engine.ts
// Main mode router for the AI Auto Reply Engine.
//
// Pipeline (called from ai.processor.ts when autoReplyMode is set):
//   1.  Mode gate          — if "off" or "suggest", skip
//   2.  Channel gate       — is this channel active for auto-reply?
//   3.  Business hours gate — within active_hours_start/end?
//   4.  AI paused check    — has agent manually paused AI for this conversation?
//   5.  Cooldown gate      — respects cooldown_seconds between replies
//   6.  Daily limit gate   — max daily_auto_limit auto-sends per conversation
//   7.  Quota gate         — isWithinQuota(workspaceId, "ai_credits")
//   8.  Handoff check      — detectHandoffRules() (fast, no API cost)
//   9.  Intent gate        — classifyIntent() → blocked_intents check
//   10. Generate reply     — runAIReply() (full orchestrator pipeline)
//   11. Confidence tier    — route to: auto-send | draft | handoff
//   12. Write draft / send — createDraft() or markDraftAutoSent() + metrics

import { getRedis } from "@/lib/redis/client";
import { isWithinQuota, incrementUsage } from "@/lib/billing/usage";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { detectHandoffRules } from "./handoff-detector";
import { executeHandoff } from "./handoff";
import { classifyIntent } from "./intent-classifier";
import { runAIReply } from "./orchestrator";
import { getAutoReplySettings } from "./auto-reply-settings";
import { createDraft, markDraftAutoSent, countRecentRejections } from "./draft-manager";
import { recordReplyEvent } from "./reply-metrics";
import { enqueueOutbound } from "@/lib/queue/producers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("ai:auto-reply-engine");

// ─── Input ────────────────────────────────────────────────────────────────────

export interface AutoReplyInput {
  userId:           string;
  conversationId:   string;
  phone:            string;
  incomingText:     string;
  channel:          string;   // "whatsapp" | "instagram" | "messenger"
  instanceName:     string;
  serverUrl:        string;
  instanceApiKey:   string;
  triggerMessageId?: string;
  promptId?:         string;
}

export interface AutoReplyResult {
  action:     "skipped" | "draft_created" | "auto_sent" | "handoff" | "error";
  reason?:    string;
  draftId?:   string;
  confidence?: number;
  intent?:    string;
}

// ─── Redis key helpers ────────────────────────────────────────────────────────

const COOLDOWN_KEY  = (userId: string, convId: string) =>
  `ai:cooldown:${userId}:${convId}`;

const DAILY_KEY     = (userId: string, convId: string) => {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `ai:daily:${userId}:${convId}:${today}`;
};

const PAUSED_KEY    = (convId: string) => `ai:paused:${convId}`;

// ─── Main engine ──────────────────────────────────────────────────────────────

export async function runAutoReply(input: AutoReplyInput): Promise<AutoReplyResult> {
  const { userId, conversationId, channel } = input;
  const qlog = log.child({ userId, conversationId });

  // 1. Load settings
  const settings = await getAutoReplySettings(userId);

  if (settings.mode === "off" || settings.mode === "suggest") {
    void recordReplyEvent({ userId, conversationId, event: "mode_off_skipped", mode: settings.mode, channel });
    return { action: "skipped", reason: `mode=${settings.mode}` };
  }

  // 2. Channel gate
  if (!settings.activeChannels.includes(channel)) {
    return { action: "skipped", reason: `channel_inactive:${channel}` };
  }

  // 3. Business hours gate
  if (!isWithinBusinessHours(settings)) {
    void recordReplyEvent({ userId, conversationId, event: "business_hours_blocked", mode: settings.mode, channel });
    return { action: "skipped", reason: "outside_business_hours" };
  }

  // 4. AI paused check
  const redis = getRedis();
  const paused = await redis.exists(PAUSED_KEY(conversationId));
  if (paused) {
    return { action: "skipped", reason: "ai_paused_by_agent" };
  }

  // 5. Cooldown gate
  const cooldownKey = COOLDOWN_KEY(userId, conversationId);
  const onCooldown  = await redis.exists(cooldownKey);
  if (onCooldown) {
    void recordReplyEvent({ userId, conversationId, event: "cooldown_blocked", mode: settings.mode, channel });
    return { action: "skipped", reason: "cooldown" };
  }

  // 6. Daily limit gate
  const dailyKey   = DAILY_KEY(userId, conversationId);
  const dailyCount = await redis.incr(dailyKey);
  if (dailyCount === 1) await redis.expire(dailyKey, 86_400); // 24h TTL on first increment
  if (dailyCount > settings.dailyAutoLimit) {
    return { action: "skipped", reason: "daily_limit_exceeded" };
  }

  // 7. Quota gate
  const workspaceId = await getUserPrimaryWorkspace(userId);
  if (workspaceId) {
    const withinQuota = await isWithinQuota(workspaceId, "ai_credits");
    if (!withinQuota) {
      void recordReplyEvent({ userId, conversationId, event: "quota_blocked", mode: settings.mode, channel });
      return { action: "skipped", reason: "quota_exceeded" };
    }
  }

  // 8. Fast handoff check (no API cost)
  const handoffCheck = detectHandoffRules({ text: input.incomingText, failureCount: 0 });
  if (handoffCheck.shouldHandoff && handoffCheck.reason) {
    await executeHandoff({ userId, conversationId, reason: handoffCheck.reason, triggeredMessage: input.incomingText });
    void recordReplyEvent({ userId, conversationId, event: "handoff_triggered", mode: settings.mode, channel, intent: handoffCheck.reason });
    return { action: "handoff", reason: handoffCheck.reason };
  }

  // 9. Intent classification → blocked_intents gate
  let intent: string | null = null;
  if (settings.blockedIntents.length > 0) {
    try {
      const intentResult = await classifyIntent({
        text:       input.incomingText,
        categories: ["pricing", "support", "booking", "complaint", "spam", "lead", "general", "unknown"],
        userId,
      });
      intent = intentResult.category;

      if (settings.blockedIntents.includes(intent)) {
        void recordReplyEvent({ userId, conversationId, event: "intent_blocked", mode: settings.mode, channel, intent });
        return { action: "skipped", reason: `intent_blocked:${intent}` };
      }
    } catch {
      // Intent classification failure → allow through (fail open)
      qlog.warn("intent classification failed — proceeding");
    }
  }

  // 10. Generate reply via the full orchestrator pipeline
  // NOTE: runAIReply() already handles: RAG → generate → moderate → confidence gate → handoff
  // We call it and then apply our own confidence tier on top.
  const startMs = Date.now();

  // We need to generate without auto-sending — so we use a minimal shim that
  // calls the OpenAI pipeline but returns the result without enqueueing outbound.
  // This is done by calling the new generateDraftContent() helper below.
  const generated = await generateDraftContent({
    userId,
    conversationId,
    phone:          input.phone,
    incomingText:   input.incomingText,
    instanceName:   input.instanceName,
    serverUrl:      input.serverUrl,
    instanceApiKey: input.instanceApiKey,
    promptId:       input.promptId ?? settings.promptId ?? undefined,
  });

  const latencyMs = Date.now() - startMs;

  if (!generated) {
    return { action: "error", reason: "generation_failed" };
  }

  const { content, confidence, model, promptTokens, completionTokens } = generated;

  // 11. Confidence tier routing
  qlog.info("confidence tier", { confidence, mode: settings.mode });

  if (confidence < settings.approvalThreshold) {
    // Below approval threshold → handoff
    await executeHandoff({ userId, conversationId, reason: "low_confidence", confidence, triggeredMessage: input.incomingText });
    void recordReplyEvent({ userId, conversationId, event: "confidence_gate_failed", mode: settings.mode, channel, confidence, intent, latencyMs });
    return { action: "handoff", reason: "low_confidence", confidence };
  }

  // 12a. Both modes: always create a draft first (audit trail)
  const draft = await createDraft({
    userId,
    conversationId,
    content,
    confidence,
    intent,
    model,
    promptTokens,
    completionTokens,
    latencyMs,
    triggerMessageId: input.triggerMessageId ?? null,
    triggerContent:   input.incomingText,
  });

  void recordReplyEvent({ userId, conversationId, event: "draft_created", mode: settings.mode, channel, confidence, intent, latencyMs });

  // 12b. Full auto + confidence above auto_send_threshold → send immediately
  if (
    settings.mode === "full_auto" &&
    confidence >= settings.autoSendThreshold
  ) {
    // Check for 3+ consecutive rejections (agent may have lost trust in AI)
    const recentRejections = await countRecentRejections(userId, conversationId, 3);
    if (recentRejections >= 3) {
      qlog.warn("3 consecutive rejections — falling back to approval mode");
      void recordReplyEvent({ userId, conversationId, event: "fallback_approval", mode: settings.mode, channel, confidence, intent });
      return { action: "draft_created", draftId: draft?.id ?? undefined, confidence, intent: intent ?? undefined };
    }

    // Auto-send via outbound queue
    await enqueueOutbound({
      instanceName:   input.instanceName,
      serverUrl:      input.serverUrl,
      apiKey:         input.instanceApiKey,
      phone:          input.phone,
      content,
      type:           "text",
      conversationId,
      userId,
      origin:         "ai_reply",
      agentName:      "FlowAI",
    });

    if (draft) await markDraftAutoSent(draft.id);
    if (workspaceId) void incrementUsage(workspaceId, "ai_credits_used");

    // Set cooldown
    await redis.set(cooldownKey, "1", "EX", settings.cooldownSeconds);

    void recordReplyEvent({ userId, conversationId, event: "auto_sent", mode: settings.mode, channel, confidence, intent, latencyMs });

    qlog.info("auto-sent", { confidence, intent, latencyMs });
    return { action: "auto_sent", draftId: draft?.id ?? undefined, confidence, intent: intent ?? undefined };
  }

  // 12c. Approval mode (or full_auto below auto_send_threshold) → draft awaits agent
  void recordReplyEvent({ userId, conversationId, event: "confidence_gate_passed", mode: settings.mode, channel, confidence, intent, latencyMs });
  return { action: "draft_created", draftId: draft?.id ?? undefined, confidence, intent: intent ?? undefined };
}

// ─── Draft content generator ─────────────────────────────────────────────────
// Thin wrapper around the AI pipeline that returns the generated text + metadata
// WITHOUT sending it. This keeps the orchestrator unchanged.

interface GeneratedContent {
  content:          string;
  confidence:       number;
  model:            string;
  promptTokens:     number;
  completionTokens: number;
}

async function generateDraftContent(opts: {
  userId:           string;
  conversationId:   string;
  phone:            string;
  incomingText:     string;
  instanceName:     string;
  serverUrl:        string;
  instanceApiKey:   string;
  promptId?:        string;
}): Promise<GeneratedContent | null> {
  try {
    // Re-use the prompt manager + context manager + RAG logic from the orchestrator.
    // We call a stripped-down version that generates but does NOT enqueue outbound.
    const { getOpenAI } = await import("./client");
    const { resolvePrompt, interpolatePrompt } = await import("./prompt-manager");
    const { getAIContext } = await import("./context-manager");
    const { retrieveRelevantContext } = await import("./embeddings");
    const { moderateText } = await import("./moderator");
    const { recordUsage } = await import("./metering");
    const db = createAdminClient();

    const MODEL = "gpt-4o-mini";

    // Load prompt + context in parallel
    const [prompt, ctx] = await Promise.all([
      resolvePrompt(opts.userId, opts.promptId),
      getAIContext(opts.userId, opts.conversationId),
    ]);

    // Recent message history
    const { data: rawHistory } = await db
      .from("messages")
      .select("sender, content")
      .eq("conversation_id", opts.conversationId)
      .order("created_at", { ascending: false })
      .limit(ctx.messageWindow);

    const history = (rawHistory ?? [])
      .reverse()
      .map((m) => ({
        role:    (m.sender === "agent" ? "assistant" : "user") as "assistant" | "user",
        content: m.content ?? "",
      }))
      .filter((m, i, arr) => !(i === arr.length - 1 && m.role === "user"));

    // RAG context
    const ragResults = await retrieveRelevantContext(opts.userId, opts.conversationId, opts.incomingText, 3);

    // Build system prompt
    const systemParts: string[] = [
      interpolatePrompt(prompt.systemPrompt, {
        "contact.phone":   opts.phone,
        "conversation.id": opts.conversationId,
      }),
    ];
    if (ctx.summary) systemParts.push(`\n\n## Resumen previo\n${ctx.summary}`);
    const facts = Object.entries(ctx.facts);
    if (facts.length > 0) {
      systemParts.push("\n\n## Datos del contacto\n" + facts.map(([k, v]) => `- ${k}: ${v}`).join("\n"));
    }
    if (ragResults.length > 0) {
      systemParts.push("\n\n## Contexto relevante\n" + ragResults.map((r) => `- ${r.content}`).join("\n"));
    }

    const messages = [
      { role: "system" as const, content: systemParts.join("") +
        '\n\nResponde SOLO con JSON válido:\n{"message":"<tu respuesta>","confidence":<0.0-1.0>,"needs_handoff":<true|false>}\n' +
        "confidence = seguridad en tu respuesta." },
      ...history,
      { role: "user" as const, content: opts.incomingText },
    ];

    const openai = getOpenAI();
    const start  = Date.now();

    const completion = await openai.chat.completions.create({
      model:           prompt.model ?? MODEL,
      messages,
      max_tokens:      (prompt.maxTokens ?? 500) + 60,
      temperature:     prompt.temperature ?? 0.7,
      response_format: { type: "json_object" },
    });

    const raw    = completion.choices[0]?.message?.content ?? "{}";
    const latMs  = Date.now() - start;
    let parsed: { message?: string; confidence?: number; needs_handoff?: boolean } = {};
    try { parsed = JSON.parse(raw); } catch { /* keep defaults */ }

    const content    = parsed.message?.trim() ?? "";
    const confidence = typeof parsed.confidence === "number"
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.5;
    const usage = completion.usage;

    if (!content) return null;

    // Moderation check
    const modResult = await moderateText(content, opts.userId);
    if (modResult.flagged) return null;

    // Record usage (fire-and-forget)
    if (usage) {
      void recordUsage({
        userId:          opts.userId,
        conversationId:  opts.conversationId,
        model:           prompt.model ?? MODEL,
        operation:       "suggest",
        promptTokens:    usage.prompt_tokens,
        completionTokens: usage.completion_tokens ?? 0,
        latencyMs:       latMs,
      });
    }

    return {
      content,
      confidence,
      model:            prompt.model ?? MODEL,
      promptTokens:     usage?.prompt_tokens     ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
    };
  } catch (err) {
    log.error("generateDraftContent failed", { error: String(err) });
    return null;
  }
}

// ─── Business hours check ─────────────────────────────────────────────────────

function isWithinBusinessHours(settings: {
  activeHoursStart: string | null;
  activeHoursEnd:   string | null;
  activeTimezone:   string;
}): boolean {
  if (!settings.activeHoursStart || !settings.activeHoursEnd) return true; // no gate = always active

  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: settings.activeTimezone,
      hour:     "2-digit",
      minute:   "2-digit",
      hour12:   false,
    });
    const localTime = formatter.format(now); // "HH:MM"

    return localTime >= settings.activeHoursStart && localTime <= settings.activeHoursEnd;
  } catch {
    return true; // Invalid timezone → fail open
  }
}

// ─── AI pause helpers (called from /api/ai/auto-reply/pause) ─────────────────

/** Pause AI for a conversation (24h default, agent can resume). */
export async function pauseAIForConversation(
  conversationId: string,
  ttlSeconds      = 86_400
): Promise<void> {
  const redis = getRedis();
  await redis.set(PAUSED_KEY(conversationId), "1", "EX", ttlSeconds);
}

/** Resume AI for a conversation (delete the pause key). */
export async function resumeAIForConversation(conversationId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(PAUSED_KEY(conversationId));
}

/** Check if AI is currently paused for a conversation. */
export async function isAIPaused(conversationId: string): Promise<boolean> {
  const redis = getRedis();
  return (await redis.exists(PAUSED_KEY(conversationId))) === 1;
}
