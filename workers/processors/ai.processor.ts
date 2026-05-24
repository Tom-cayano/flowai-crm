// AI queue processor — handles AIJob payloads from wpp:ai.
// Runs the full orchestration pipeline; rethrowing on error triggers BullMQ retry.

import type { AIJob } from "@/lib/queue/types";
import { runAIReply } from "@/lib/ai/orchestrator";
import { classifyIntent } from "@/lib/ai/intent-classifier";
import { qualifyLead } from "@/lib/ai/lead-qualifier";
import { storeEmbedding } from "@/lib/ai/embeddings";
import { upsertLeadScore } from "@/lib/ai/lead-scorer";
import { createAdminClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("processor:ai");

// Tier → numeric score delta applied to contact_scores after qualification
const TIER_DELTAS: Record<string, number> = {
  hot:        +25,
  warm:       +10,
  cold:       -5,
  not_a_lead:  0,
};

export async function processAI(job: AIJob): Promise<void> {
  const { userId, conversationId, correlationId } = job;
  const qlog = log.child({ userId, conversationId, correlationId });

  // ── Core AI reply (always runs) ─────────────────────────────────────────────
  const result = await runAIReply({
    userId,
    conversationId,
    phone:          job.phone,
    incomingText:   job.incomingText,
    instanceName:   job.instanceName,
    serverUrl:      job.serverUrl,
    instanceApiKey: job.instanceApiKey,
    promptId:       job.promptId,
    model:          job.model,
    maxTokens:      job.maxTokens,
    temperature:    job.temperature,
  });

  qlog.info("reply result", {
    sent:      result.sent,
    handedOff: result.handedOff,
    tokens:    result.tokens?.total,
  });

  // ── Optional operations ──────────────────────────────────────────────────────

  if (job.ops?.classify) {
    try {
      const intent = await classifyIntent({
        text:       job.incomingText,
        categories: ["ventas", "soporte", "consulta", "queja", "otro"],
        userId,
      });
      qlog.info("intent classified", { category: intent.category, confidence: intent.confidence });
    } catch (err) {
      qlog.warn("intent classification failed", { error: String(err) });
    }
  }

  if (job.ops?.qualify) {
    try {
      const db = createAdminClient();
      // Build a compact conversation snapshot for qualification
      const { data: msgs } = await db
        .from("messages")
        .select("sender, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(30);

      const snapshot = (msgs ?? [])
        .map((m) => `${m.sender === "agent" ? "Agente" : "Cliente"}: ${m.content}`)
        .join("\n");

      const qual = await qualifyLead({ userId, conversationId, conversationText: snapshot });

      qlog.info("lead qualified", { tier: qual.tier, score: qual.score });

      // Apply score delta to contact_scores
      const delta = TIER_DELTAS[qual.tier] ?? 0;
      if (delta !== 0) {
        const { data: conv } = await db
          .from("conversations")
          .select("contact_id")
          .eq("id", conversationId)
          .maybeSingle();
        if (conv?.contact_id) {
          await upsertLeadScore({
            userId,
            contactId: conv.contact_id,
            delta,
            reason:    `ai_qualification:${qual.tier}`,
          });
        }
      }
    } catch (err) {
      qlog.warn("lead qualification failed", { error: String(err) });
    }
  }

  if (job.ops?.embed && job.incomingText) {
    try {
      await storeEmbedding({
        userId,
        conversationId,
        content: job.incomingText,
      });
    } catch (err) {
      qlog.warn("embedding failed", { error: String(err) });
    }
  }
}

// Re-export with the naming convention used by other processors
export { processAI as default };
