// Detects when a conversation should be handed to a human agent.
// Checks sentiment signals, explicit requests, and repeated failures.

import OpenAI from "openai";
import type { HandoffDecision, HandoffReason } from "@/types/automation";

const HANDOFF_KEYWORDS = [
  "hablar con un humano",
  "hablar con una persona",
  "agente humano",
  "operador",
  "representante",
  "transferir",
  "speak to a human",
  "real person",
  "agent please",
  "transfer me",
];

const NEGATIVE_SENTIMENT_KEYWORDS = [
  "muy mal",
  "horrible",
  "terrible",
  "inaceptable",
  "inútil",
  "esto es una basura",
  "estoy furioso",
  "qué asco",
  "muy enojado",
];

interface DetectOptions {
  text:         string;
  failureCount: number;   // # of consecutive AI failures for this conversation
  useAI?:       boolean;  // call OpenAI for sentiment (costs extra)
}

/** Fast rule-based check (runs synchronously, no API call). */
export function detectHandoffRules(opts: DetectOptions): HandoffDecision {
  const lower = opts.text.toLowerCase();

  for (const kw of HANDOFF_KEYWORDS) {
    if (lower.includes(kw)) {
      return { shouldHandoff: true, reason: "explicit_request", confidence: 0.95 };
    }
  }

  for (const kw of NEGATIVE_SENTIMENT_KEYWORDS) {
    if (lower.includes(kw)) {
      return { shouldHandoff: true, reason: "sentiment_negative", confidence: 0.8 };
    }
  }

  if (opts.failureCount >= 3) {
    return { shouldHandoff: true, reason: "repeated_failure", confidence: 0.9 };
  }

  return { shouldHandoff: false, reason: null, confidence: 1 };
}

/** AI-enhanced check — more accurate but costs tokens. */
export async function detectHandoffAI(opts: DetectOptions): Promise<HandoffDecision> {
  // First run cheap rule-based check
  const ruleResult = detectHandoffRules(opts);
  if (ruleResult.shouldHandoff) return ruleResult;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !opts.useAI) return ruleResult;

  const openai = new OpenAI({ apiKey });

  try {
    const completion = await openai.chat.completions.create({
      model:      "gpt-4o-mini",
      messages: [
        {
          role:    "system",
          content: [
            "Eres un detector de escalaciones. Responde solo con JSON.",
            'Formato: {"handoff":true/false,"reason":"<sentiment_negative|explicit_request|escalation_requested|null>","confidence":0.0-1.0}',
            "Determina si el mensaje del cliente indica frustración extrema, intención de hablar con un humano o necesidad de escalación urgente.",
          ].join(" "),
        },
        { role: "user", content: `Mensaje: "${opts.text}"` },
      ],
      max_tokens:      80,
      temperature:     0,
      response_format: { type: "json_object" },
    });

    const raw    = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { handoff?: boolean; reason?: string; confidence?: number };

    return {
      shouldHandoff: parsed.handoff ?? false,
      reason:        (parsed.reason as HandoffReason | null) ?? null,
      confidence:    typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    };
  } catch {
    return ruleResult;
  }
}
