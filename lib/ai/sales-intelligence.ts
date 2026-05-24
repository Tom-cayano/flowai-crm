// AI Sales Intelligence — BANT-plus analysis of conversation sales signals.
// Single structured call covering: lead tier, opportunity score, churn risk,
// buying signals, objections, health, and timeline prediction.
// Cached in Redis to avoid repeated analysis on copilot panel re-opens.

import { getOpenAI } from "./client";
import { recordUsage } from "./metering";
import { getCachedAI, setCachedAI, aiKey } from "./cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLeadScore } from "./lead-scorer";

const MODEL = "gpt-4o-mini";

export type LeadTier      = "hot" | "warm" | "cold" | "not_a_lead";
export type ChurnRisk     = "high" | "medium" | "low" | "none";
export type Timeline      = "immediate" | "this_quarter" | "next_quarter" | "unknown";

export interface SalesIntelligence {
  leadTier:           LeadTier;
  opportunityScore:   number;      // 0–100
  churnRisk:          ChurnRisk;
  healthScore:        number;      // 0–100 relationship health
  buyingSignals:      string[];    // detected buying intent phrases
  objections:         string[];    // detected objections/blockers
  recommendedActions: string[];    // top 2–3 actions
  predictedTimeline:  Timeline;
  currentLeadScore:   number;      // from contact_scores table
}

export async function getSalesIntelligence(
  conversationId: string,
  userId: string,
  contactId?: string | null,
  forceRefresh = false
): Promise<SalesIntelligence | null> {
  const cacheKey = aiKey.salesIntel(conversationId);

  if (!forceRefresh) {
    const cached = await getCachedAI<SalesIntelligence>(cacheKey);
    if (cached) return cached;
  }

  const db = createAdminClient();

  // Fetch transcript + contact score in parallel
  const [{ data: msgs }, currentLeadScore] = await Promise.all([
    db
      .from("messages")
      .select("sender, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(40),
    contactId ? getLeadScore(userId, contactId) : Promise.resolve(0),
  ]);

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
            "Eres un experto en análisis de ventas. Analiza la conversación y extrae señales comerciales.",
            "Responde SOLO con JSON válido:",
            '{"leadTier":"hot|warm|cold|not_a_lead","opportunityScore":0-100,"churnRisk":"high|medium|low|none",',
            '"healthScore":0-100,"buyingSignals":["<señal1>"],"objections":["<objeción1>"],',
            '"recommendedActions":["<acción1>"],"predictedTimeline":"immediate|this_quarter|next_quarter|unknown"}',
            "opportunityScore=probabilidad de cierre (0=imposible, 100=seguro).",
            "healthScore=salud de la relación cliente-empresa.",
            "Responde en español.",
          ].join(" "),
        },
        { role: "user", content: transcript.slice(0, 5_000) },
      ],
      max_tokens:      300,
      temperature:     0.1,
      response_format: { type: "json_object" },
    });

    const raw    = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<SalesIntelligence>;
    const usage  = completion.usage;

    if (usage) {
      void recordUsage({
        userId, conversationId,
        model:            MODEL,
        operation:        "qualify",
        promptTokens:     usage.prompt_tokens,
        completionTokens: usage.completion_tokens ?? 0,
        latencyMs:        Date.now() - start,
      });
    }

    const validTiers: LeadTier[]  = ["hot", "warm", "cold", "not_a_lead"];
    const validRisks: ChurnRisk[] = ["high", "medium", "low", "none"];
    const validTL: Timeline[]     = ["immediate", "this_quarter", "next_quarter", "unknown"];

    const result: SalesIntelligence = {
      leadTier:           validTiers.includes(parsed.leadTier as LeadTier) ? (parsed.leadTier as LeadTier) : "cold",
      opportunityScore:   clamp(parsed.opportunityScore ?? 0),
      churnRisk:          validRisks.includes(parsed.churnRisk as ChurnRisk) ? (parsed.churnRisk as ChurnRisk) : "none",
      healthScore:        clamp(parsed.healthScore ?? 70),
      buyingSignals:      arr(parsed.buyingSignals),
      objections:         arr(parsed.objections),
      recommendedActions: arr(parsed.recommendedActions),
      predictedTimeline:  validTL.includes(parsed.predictedTimeline as Timeline) ? (parsed.predictedTimeline as Timeline) : "unknown",
      currentLeadScore,
    };

    await setCachedAI(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

function clamp(n: number | undefined): number {
  return Math.min(100, Math.max(0, typeof n === "number" ? n : 0));
}

function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
