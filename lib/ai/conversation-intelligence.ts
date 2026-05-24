// Batch conversation intelligence — one structured OpenAI call per conversation
// that returns sentiment, emotion, urgency, topics, intent, insights, and coaching.
// Results are cached in Redis for 5 minutes so the copilot panel loads instantly
// on repeat opens.

import { getOpenAI } from "./client";
import { recordUsage } from "./metering";
import { getCachedAI, setCachedAI, aiKey } from "./cache";
import { createAdminClient } from "@/lib/supabase/admin";

const MODEL = "gpt-4o-mini";

export type Sentiment  = "positive" | "neutral" | "negative";
export type Emotion    = "excited" | "satisfied" | "neutral" | "confused" | "frustrated" | "angry";
export type Urgency    = "high" | "medium" | "low";
export type Intent     = "purchase" | "support" | "inquiry" | "complaint" | "feedback" | "other";

export interface ConversationIntelligence {
  sentiment:       Sentiment;
  sentimentScore:  number;         // 0–1 confidence
  emotion:         Emotion;
  urgency:         Urgency;
  topics:          string[];        // e.g. ["pricing", "integration", "delivery"]
  tags:            string[];        // e.g. ["price-sensitive", "needs-followup"]
  intent:          Intent;
  keyInsights:     string[];        // 2–4 bullet observations
  nextBestAction:  string;          // concrete recommended action for agent
  summary:         string;          // 2–3 sentence summary
  qualityScore:    number;          // 0–100 agent response quality estimate
  coachingTips:    string[];        // 1–3 coaching suggestions for the agent
}

export async function analyzeConversation(
  conversationId: string,
  userId: string,
  forceRefresh = false
): Promise<ConversationIntelligence | null> {
  const cacheKey = aiKey.intelligence(conversationId);

  if (!forceRefresh) {
    const cached = await getCachedAI<ConversationIntelligence>(cacheKey);
    if (cached) return cached;
  }

  const db = createAdminClient();
  const { data: msgs } = await db
    .from("messages")
    .select("sender, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(40);

  if (!msgs || msgs.length === 0) return null;

  const transcript = msgs
    .map((m) => `${m.sender === "agent" ? "Agente" : "Cliente"}: ${m.content}`)
    .join("\n");

  const openai = getOpenAI();
  const start  = Date.now();

  try {
    const completion = await openai.chat.completions.create({
      model:  MODEL,
      messages: [
        {
          role:    "system",
          content: [
            "Analiza esta conversación de soporte/ventas y responde SOLO con JSON válido.",
            "Sé preciso, conciso, y en el mismo idioma de la conversación.",
            "Formato requerido:",
            '{"sentiment":"positive|neutral|negative","sentimentScore":0.0-1.0,',
            '"emotion":"excited|satisfied|neutral|confused|frustrated|angry",',
            '"urgency":"high|medium|low",',
            '"topics":["<topic1>","<topic2>"],',
            '"tags":["<tag1>","<tag2>"],',
            '"intent":"purchase|support|inquiry|complaint|feedback|other",',
            '"keyInsights":["<insight1>","<insight2>"],',
            '"nextBestAction":"<acción concreta>",',
            '"summary":"<2-3 frases>",',
            '"qualityScore":0-100,',
            '"coachingTips":["<tip1>","<tip2>"]}',
            "qualityScore: calidad de las respuestas del agente (0=muy mala, 100=excelente).",
            "coachingTips: sugerencias específicas para mejorar la respuesta del agente.",
          ].join(" "),
        },
        { role: "user", content: transcript.slice(0, 6_000) },
      ],
      max_tokens:      500,
      temperature:     0.2,
      response_format: { type: "json_object" },
    });

    const raw    = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<ConversationIntelligence>;
    const usage  = completion.usage;

    if (usage) {
      void recordUsage({
        userId, conversationId,
        model:            MODEL,
        operation:        "classify",
        promptTokens:     usage.prompt_tokens,
        completionTokens: usage.completion_tokens ?? 0,
        latencyMs:        Date.now() - start,
      });
    }

    const result: ConversationIntelligence = {
      sentiment:      parsed.sentiment      ?? "neutral",
      sentimentScore: parsed.sentimentScore ?? 0.5,
      emotion:        parsed.emotion        ?? "neutral",
      urgency:        parsed.urgency        ?? "medium",
      topics:         Array.isArray(parsed.topics)       ? parsed.topics       : [],
      tags:           Array.isArray(parsed.tags)         ? parsed.tags         : [],
      intent:         parsed.intent         ?? "other",
      keyInsights:    Array.isArray(parsed.keyInsights)  ? parsed.keyInsights  : [],
      nextBestAction: parsed.nextBestAction ?? "",
      summary:        parsed.summary        ?? "",
      qualityScore:   typeof parsed.qualityScore === "number" ? parsed.qualityScore : 70,
      coachingTips:   Array.isArray(parsed.coachingTips) ? parsed.coachingTips : [],
    };

    await setCachedAI(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}
