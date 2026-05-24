// AI Copilot — suggested replies, tone rephrase, and agent coaching.
// All calls use gpt-4o-mini with structured JSON output and Redis caching.
// Streaming suggested replies are handled in the API route (not here).

import { getOpenAI } from "./client";
import { recordUsage } from "./metering";
import { getCachedAI, setCachedAI, aiKey } from "./cache";
import { createAdminClient } from "@/lib/supabase/admin";

const MODEL = "gpt-4o-mini";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Tone = "professional" | "friendly" | "empathetic";

export interface SuggestedReply {
  tone:    Tone;
  text:    string;
  label:   string;   // Short UI label: "Profesional", "Amigable", "Empático"
}

export interface CopilotSuggestions {
  replies:          SuggestedReply[];
  followUpQuestion: string;          // One question to deepen engagement
  objectionHandler: string;          // Suggested objection response (empty if none)
  keyPoints:        string[];        // 2–3 things to emphasize
}

export interface RephraseResult {
  original: string;
  rephrased: string;
  tone:      Tone;
}

export interface CoachingResult {
  score:       number;    // 0–100 quality score for this specific reply
  feedback:    string;    // One-sentence feedback
  improvement: string;    // Rewritten version if score < 70
  tips:        string[];  // 1–2 actionable tips
}

// ─── Suggested replies ────────────────────────────────────────────────────────

export async function getSuggestedReplies(opts: {
  conversationId: string;
  userId:         string;
  lastMessage:    string;
  forceRefresh?:  boolean;
}): Promise<CopilotSuggestions | null> {
  const cacheKey = aiKey.suggestions(opts.conversationId);

  if (!opts.forceRefresh) {
    const cached = await getCachedAI<CopilotSuggestions>(cacheKey);
    if (cached) return cached;
  }

  const db = createAdminClient();
  const { data: msgs } = await db
    .from("messages")
    .select("sender, content")
    .eq("conversation_id", opts.conversationId)
    .order("created_at", { ascending: false })
    .limit(10);

  const recentHistory = (msgs ?? [])
    .reverse()
    .map((m) => `${m.sender === "agent" ? "Agente" : "Cliente"}: ${m.content}`)
    .join("\n");

  const openai = getOpenAI();
  const start  = Date.now();

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role:    "system",
          content: [
            "Eres un asistente de ventas experto. Genera respuestas sugeridas para el agente.",
            "Analiza el historial de conversación y el último mensaje del cliente.",
            "Responde SOLO con JSON válido:",
            '{"replies":[',
            '{"tone":"professional","text":"<respuesta>","label":"Profesional"},',
            '{"tone":"friendly","text":"<respuesta>","label":"Amigable"},',
            '{"tone":"empathetic","text":"<respuesta>","label":"Empático"}',
            '],"followUpQuestion":"<pregunta>","objectionHandler":"<manejo de objeción o vacío>",',
            '"keyPoints":["<punto1>","<punto2>"]}',
            "Las respuestas deben ser concisas (máx 3 oraciones), relevantes y listas para enviar.",
            "Si no hay objeción detectable, deja objectionHandler vacío.",
            "Responde siempre en el idioma de la conversación.",
          ].join(" "),
        },
        {
          role:    "user",
          content: `Historial reciente:\n${recentHistory}\n\nÚltimo mensaje del cliente: ${opts.lastMessage}`,
        },
      ],
      max_tokens:      600,
      temperature:     0.4,
      response_format: { type: "json_object" },
    });

    const raw    = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<CopilotSuggestions>;
    const usage  = completion.usage;

    if (usage) {
      void recordUsage({
        userId:           opts.userId,
        conversationId:   opts.conversationId,
        model:            MODEL,
        operation:        "suggest",
        promptTokens:     usage.prompt_tokens,
        completionTokens: usage.completion_tokens ?? 0,
        latencyMs:        Date.now() - start,
      });
    }

    const result: CopilotSuggestions = {
      replies:          Array.isArray(parsed.replies) ? parsed.replies.slice(0, 3) : [],
      followUpQuestion: parsed.followUpQuestion ?? "",
      objectionHandler: parsed.objectionHandler ?? "",
      keyPoints:        Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
    };

    await setCachedAI(cacheKey, result, 120); // 2-minute cache (message-specific)
    return result;
  } catch {
    return null;
  }
}

// ─── Tone rephrase ────────────────────────────────────────────────────────────

export async function rephraseReply(opts: {
  text:           string;
  targetTone:     Tone;
  userId:         string;
  conversationId: string;
}): Promise<RephraseResult | null> {
  const TONE_DESCRIPTIONS: Record<Tone, string> = {
    professional: "formal, conciso y orientado a soluciones",
    friendly:     "cálido, conversacional y cercano",
    empathetic:   "comprensivo, validador y orientado al cliente",
  };

  const openai = getOpenAI();
  const start  = Date.now();

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role:    "system",
          content: `Reformula el siguiente mensaje en tono ${TONE_DESCRIPTIONS[opts.targetTone]}. ` +
                   "Mantén el mismo significado y longitud aproximada. " +
                   'Responde SOLO con JSON: {"rephrased":"<texto>"}',
        },
        { role: "user", content: opts.text },
      ],
      max_tokens:      300,
      temperature:     0.3,
      response_format: { type: "json_object" },
    });

    const raw    = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { rephrased?: string };
    const usage  = completion.usage;

    if (usage) {
      void recordUsage({
        userId:           opts.userId,
        conversationId:   opts.conversationId,
        model:            MODEL,
        operation:        "rephrase",
        promptTokens:     usage.prompt_tokens,
        completionTokens: usage.completion_tokens ?? 0,
        latencyMs:        Date.now() - start,
      });
    }

    if (!parsed.rephrased) return null;

    return {
      original:  opts.text,
      rephrased: parsed.rephrased,
      tone:      opts.targetTone,
    };
  } catch {
    return null;
  }
}

// ─── Agent coaching ───────────────────────────────────────────────────────────

export async function coachReply(opts: {
  agentReply:     string;
  customerMessage: string;
  userId:         string;
  conversationId: string;
}): Promise<CoachingResult | null> {
  const openai = getOpenAI();
  const start  = Date.now();

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role:    "system",
          content: [
            "Eres un coach de comunicación para agentes de ventas/soporte.",
            "Evalúa la respuesta del agente al mensaje del cliente.",
            "Responde SOLO con JSON válido:",
            '{"score":0-100,"feedback":"<una oración>","improvement":"<versión mejorada o vacío si score>=70>","tips":["<tip1>","<tip2>"]}',
            "score: calidad de la respuesta (0=muy mala, 100=perfecta).",
            "improvement: solo si score < 70, reescribe la respuesta del agente.",
            "tips: 1-2 sugerencias específicas y accionables.",
            "Responde en el idioma de la conversación.",
          ].join(" "),
        },
        {
          role:    "user",
          content: `Mensaje del cliente: ${opts.customerMessage}\n\nRespuesta del agente: ${opts.agentReply}`,
        },
      ],
      max_tokens:      300,
      temperature:     0.2,
      response_format: { type: "json_object" },
    });

    const raw    = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<CoachingResult>;
    const usage  = completion.usage;

    if (usage) {
      void recordUsage({
        userId:           opts.userId,
        conversationId:   opts.conversationId,
        model:            MODEL,
        operation:        "coach",
        promptTokens:     usage.prompt_tokens,
        completionTokens: usage.completion_tokens ?? 0,
        latencyMs:        Date.now() - start,
      });
    }

    return {
      score:       typeof parsed.score === "number" ? Math.min(100, Math.max(0, parsed.score)) : 70,
      feedback:    parsed.feedback    ?? "",
      improvement: parsed.improvement ?? "",
      tips:        Array.isArray(parsed.tips) ? parsed.tips : [],
    };
  } catch {
    return null;
  }
}
