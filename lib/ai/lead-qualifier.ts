// AI lead qualification — classifies contact intent and sales readiness.
// Distinct from lead-scorer.ts (which tracks numeric score history);
// this module produces a structured qualification report from a conversation snapshot.

import { getOpenAI } from "./client.js";
import { recordUsage } from "./metering.js";

const QUALIFY_MODEL = "gpt-4o-mini";

export type QualificationTier = "hot" | "warm" | "cold" | "not_a_lead";

export interface LeadQualification {
  tier:           QualificationTier;
  score:          number;          // 0-100
  budget:         boolean | null;  // null = unknown
  authority:      boolean | null;  // decision maker?
  need:           boolean | null;  // has a clear need?
  timeline:       string | null;   // e.g. "this quarter", "unknown"
  nextAction:     string;          // recommended follow-up
  reasoning:      string;
}

interface QualifyOptions {
  userId:         string;
  conversationId?: string;
  conversationText: string;  // last N messages joined
}

export async function qualifyLead(opts: QualifyOptions): Promise<LeadQualification> {
  const fallback: LeadQualification = {
    tier:       "cold",
    score:      0,
    budget:     null,
    authority:  null,
    need:       null,
    timeline:   null,
    nextAction: "Follow up in 1 week",
    reasoning:  "",
  };

  try {
    const openai = getOpenAI();
    const start  = Date.now();

    const completion = await openai.chat.completions.create({
      model:  QUALIFY_MODEL,
      messages: [
        {
          role:    "system",
          content: [
            "Eres un experto en ventas B2B que califica leads usando el framework BANT.",
            "Analiza la conversación y responde SOLO con JSON válido:",
            '{"tier":"hot|warm|cold|not_a_lead","score":0-100,',
            '"budget":true|false|null,"authority":true|false|null,',
            '"need":true|false|null,"timeline":"<string>|null",',
            '"nextAction":"<acción concreta>","reasoning":"<1-2 frases>"}',
            "tier: hot=listo para comprar, warm=interesado pero no urgente,",
            "cold=interés bajo, not_a_lead=no es un prospecto de ventas.",
          ].join(" "),
        },
        {
          role:    "user",
          content: `Conversación:\n${opts.conversationText.slice(0, 4_000)}`,
        },
      ],
      max_tokens:      200,
      temperature:     0,
      response_format: { type: "json_object" },
    });

    const raw    = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<LeadQualification>;
    const usage  = completion.usage;

    if (usage) {
      void recordUsage({
        userId:           opts.userId,
        conversationId:   opts.conversationId,
        model:            QUALIFY_MODEL,
        operation:        "qualify",
        promptTokens:     usage.prompt_tokens,
        completionTokens: usage.completion_tokens ?? 0,
        latencyMs:        Date.now() - start,
      });
    }

    const validTiers: QualificationTier[] = ["hot", "warm", "cold", "not_a_lead"];
    return {
      tier:       validTiers.includes(parsed.tier as QualificationTier) ? (parsed.tier as QualificationTier) : "cold",
      score:      typeof parsed.score === "number" ? Math.min(100, Math.max(0, parsed.score)) : 0,
      budget:     parsed.budget   ?? null,
      authority:  parsed.authority ?? null,
      need:       parsed.need      ?? null,
      timeline:   parsed.timeline  ?? null,
      nextAction: parsed.nextAction ?? fallback.nextAction,
      reasoning:  parsed.reasoning  ?? "",
    };
  } catch {
    return fallback;
  }
}
