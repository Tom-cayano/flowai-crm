// AI reply orchestrator — single entry point for all AI-generated responses.
//
// Pipeline (12 stages):
//   1.  Fast rule-based handoff check (no API cost)
//   2.  Parallel: resolve prompt + load AI context
//   3.  Load recent message history
//   4.  RAG context retrieval from past conversations
//   5.  Build system prompt (summary + facts + RAG)
//   6.  Generate response as structured JSON (message + confidence + needs_handoff)
//   7.  AI confidence gate → handoff if below threshold
//   8.  Moderation check on generated reply
//   9.  Enqueue outbound message
//   10. Record AI usage (metering)
//   11. Update ai_context (token count + rolling summary trigger)
//   12. Async post-turn: embed message pair + maybe summarize

import { getOpenAI } from "./client";
import { recordUsage } from "./metering";
import { moderateText } from "./moderator";
import { retrieveRelevantContext, embedMessagePair } from "./embeddings";
import { maybeGenerateSummary } from "./summarizer";
import { executeHandoff } from "./handoff";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueOutbound } from "@/lib/queue/producers";
import { resolvePrompt, interpolatePrompt } from "./prompt-manager";
import { getAIContext, updateAIContext } from "./context-manager";
import { detectHandoffRules } from "./handoff-detector";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("ai:orchestrator");

const CONFIDENCE_THRESHOLD = 0.55;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AIReplyOptions {
  userId:         string;
  conversationId: string;
  phone:          string;
  incomingText:   string;
  instanceName:   string;
  serverUrl:      string;
  instanceApiKey: string;
  promptId?:      string;
  model?:         string;
  maxTokens?:     number;
  temperature?:   number;
}

export interface AIReplyResult {
  sent:            boolean;
  handedOff:       boolean;
  handoffReason?:  string;
  reply?:          string;
  confidence?:     number;
  tokens?:         { prompt: number; completion: number; total: number };
}

// ─── Internal: structured generation ─────────────────────────────────────────

interface GeneratedResponse {
  message:       string;
  confidence:    number;
  needs_handoff: boolean;
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function generateStructuredResponse(opts: {
  model:       string;
  messages:    ChatMessage[];
  maxTokens:   number;
  temperature: number;
}): Promise<{
  response:         GeneratedResponse;
  promptTokens:     number;
  completionTokens: number;
  latencyMs:        number;
}> {
  const openai = getOpenAI();
  const start  = Date.now();

  // Inject structured-output instruction into the system message
  const augmented: ChatMessage[] = [
    {
      ...opts.messages[0]!,
      content:
        opts.messages[0]!.content +
        "\n\nResponde SOLO con JSON válido en este formato exacto:\n" +
        '{"message":"<tu respuesta>","confidence":<0.0-1.0>,"needs_handoff":<true|false>}\n' +
        "confidence = seguridad en tu respuesta (1.0=muy seguro). " +
        "needs_handoff = true solo si el cliente necesita urgentemente a un humano.",
    },
    ...opts.messages.slice(1),
  ];

  const completion = await openai.chat.completions.create({
    model:           opts.model,
    messages:        augmented,
    max_tokens:      opts.maxTokens + 60,
    temperature:     opts.temperature,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Partial<GeneratedResponse> = {};
  try {
    parsed = JSON.parse(raw) as Partial<GeneratedResponse>;
  } catch {
    parsed = { message: raw.slice(0, 2_000), confidence: 0.3, needs_handoff: false };
  }

  return {
    response: {
      message:       parsed.message       ?? "",
      confidence:    typeof parsed.confidence === "number"
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0.5,
      needs_handoff: parsed.needs_handoff ?? false,
    },
    promptTokens:     completion.usage?.prompt_tokens     ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0,
    latencyMs:        Date.now() - start,
  };
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export async function runAIReply(opts: AIReplyOptions): Promise<AIReplyResult> {
  const { userId, conversationId } = opts;
  const qlog  = log.child({ userId, conversationId });
  const timer = qlog.timer();

  // 1. Fast rule-based handoff check (zero API cost)
  const quickHandoff = detectHandoffRules({ text: opts.incomingText, failureCount: 0 });
  if (quickHandoff.shouldHandoff && quickHandoff.reason) {
    await executeHandoff({
      userId, conversationId,
      reason:           quickHandoff.reason,
      confidence:       quickHandoff.confidence,
      triggeredMessage: opts.incomingText,
    });
    qlog.info("fast handoff", { reason: quickHandoff.reason });
    return { sent: false, handedOff: true, handoffReason: quickHandoff.reason };
  }

  // 2. Parallel: resolve prompt + load AI context
  const [prompt, ctx] = await Promise.all([
    resolvePrompt(userId, opts.promptId),
    getAIContext(userId, conversationId),
  ]);

  const model       = opts.model       ?? prompt.model;
  const maxTokens   = opts.maxTokens   ?? prompt.maxTokens;
  const temperature = opts.temperature ?? prompt.temperature;

  // 3. Load recent message history
  const db = createAdminClient();
  const { data: rawHistory } = await db
    .from("messages")
    .select("sender, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(ctx.messageWindow);

  const history: ChatMessage[] = (rawHistory ?? [])
    .reverse()
    .map((m) => ({
      role:    (m.sender === "agent" ? "assistant" : "user") as "assistant" | "user",
      content: m.content ?? "",
    }))
    // Drop trailing user turn — we'll append incomingText as the live message
    .filter((m, i, arr) => !(i === arr.length - 1 && m.role === "user"));

  // 4. RAG: retrieve relevant context from past conversations
  const ragResults = await retrieveRelevantContext(userId, conversationId, opts.incomingText, 3);

  // 5. Build system prompt (base + summary + facts + RAG)
  const systemParts: string[] = [
    interpolatePrompt(prompt.systemPrompt, {
      "contact.phone":    opts.phone,
      "conversation.id":  conversationId,
    }),
  ];

  if (ctx.summary) {
    systemParts.push(`\n\n## Resumen de conversación previa\n${ctx.summary}`);
  }

  const facts = Object.entries(ctx.facts);
  if (facts.length > 0) {
    systemParts.push(
      "\n\n## Datos conocidos del contacto\n" +
      facts.map(([k, v]) => `- ${k}: ${v}`).join("\n")
    );
  }

  if (ragResults.length > 0) {
    systemParts.push(
      "\n\n## Contexto relevante de conversaciones previas\n" +
      ragResults.map((r) => `- ${r.content}`).join("\n")
    );
  }

  const messages: ChatMessage[] = [
    { role: "system",  content: systemParts.join("") },
    ...history,
    { role: "user",    content: opts.incomingText },
  ];

  // 6. Generate structured response
  let generated: Awaited<ReturnType<typeof generateStructuredResponse>>;
  try {
    generated = await generateStructuredResponse({ model, messages, maxTokens, temperature });
  } catch (err) {
    qlog.error("generation error", { error: String(err) });
    return { sent: false, handedOff: false };
  }

  const { response, promptTokens, completionTokens, latencyMs } = generated;

  // 7. AI confidence gate
  if (response.needs_handoff || response.confidence < CONFIDENCE_THRESHOLD) {
    await executeHandoff({
      userId, conversationId,
      reason:           "low_confidence",
      confidence:       response.confidence,
      triggeredMessage: opts.incomingText,
    });
    await recordUsage({
      userId, conversationId, model, operation: "reply",
      promptTokens, completionTokens, latencyMs,
    });
    qlog.info("confidence handoff", { confidence: response.confidence });
    return { sent: false, handedOff: true, handoffReason: "low_confidence" };
  }

  if (!response.message.trim()) {
    qlog.warn("empty response");
    return { sent: false, handedOff: false };
  }

  // 8. Moderation
  const moderation = await moderateText(response.message, userId);
  if (moderation.flagged) {
    qlog.warn("moderation flagged", { categories: moderation.categories });
    await recordUsage({
      userId, conversationId, model, operation: "reply",
      promptTokens, completionTokens, latencyMs,
    });
    return { sent: false, handedOff: false };
  }

  // 9. Enqueue outbound
  await enqueueOutbound({
    instanceName:   opts.instanceName,
    serverUrl:      opts.serverUrl,
    apiKey:         opts.instanceApiKey,
    phone:          opts.phone,
    content:        response.message,
    type:           "text",
    conversationId,
    userId,
    origin:         "ai_reply",
    agentName:      "FlowAI",
  });

  // 10. Metering
  await recordUsage({
    userId, conversationId, model, operation: "reply",
    promptTokens, completionTokens, latencyMs,
  });

  // 11. Update context window token count
  await updateAIContext(userId, conversationId, {
    additionalTokens: promptTokens + completionTokens,
  });

  // 12. Async post-turn (fire-and-forget — must not block reply delivery)
  void embedMessagePair(userId, conversationId, opts.incomingText, response.message);
  void maybeGenerateSummary(userId, conversationId, history.length + 1, ctx.messageWindow);

  qlog.info("reply sent", {
    model, confidence: response.confidence,
    tokens: promptTokens + completionTokens, latencyMs: timer(),
  });

  return {
    sent: true, handedOff: false,
    reply:      response.message,
    confidence: response.confidence,
    tokens: { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens },
  };
}

// Re-export so callers that imported generateRollingSummary from here still work
export { generateRollingSummary } from "./summarizer";
