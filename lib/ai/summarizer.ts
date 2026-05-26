// Semantic conversation summarizer.
// Compresses long conversation history into a dense summary stored in ai_context,
// freeing space in the prompt context window while preserving meaning.

import { getOpenAI } from "./client.js";
import { recordUsage } from "./metering.js";
import { getAIContext, updateAIContext } from "./context-manager.js";
import { createAdminClient } from "@/lib/supabase/admin";

const SUMMARY_MODEL  = "gpt-4o-mini";
const SUMMARY_TRIGGER = 15;  // summarize when history exceeds this many messages

export async function maybeGenerateSummary(
  userId:         string,
  conversationId: string,
  currentHistoryLen: number,
  windowSize:        number
): Promise<void> {
  // Only summarize when history approaches the window ceiling
  if (currentHistoryLen < Math.max(SUMMARY_TRIGGER, windowSize - 5)) return;
  await generateRollingSummary(userId, conversationId);
}

export async function generateRollingSummary(
  userId:         string,
  conversationId: string
): Promise<void> {
  const db  = createAdminClient();
  const ctx = await getAIContext(userId, conversationId);

  const { data: rawHistory } = await db
    .from("messages")
    .select("sender, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(50);

  if (!rawHistory || rawHistory.length < 5) return;

  const historyText = rawHistory
    .map((m) => `${m.sender === "agent" ? "Agente" : "Cliente"}: ${m.content}`)
    .join("\n");

  const previousSummary = ctx.summary
    ? `Resumen previo:\n${ctx.summary}\n\nConversación reciente:\n`
    : "";

  const openai  = getOpenAI();
  const start   = Date.now();

  try {
    const completion = await openai.chat.completions.create({
      model:       SUMMARY_MODEL,
      messages: [
        {
          role:    "system",
          content: [
            "Eres un asistente que resume conversaciones de soporte al cliente.",
            "Genera un resumen conciso (4-6 frases) que capture:",
            "1. El problema o intención principal del cliente",
            "2. Lo que se discutió o intentó",
            "3. El estado actual y próximos pasos si los hay",
            "4. Datos clave del cliente mencionados (nombre, empresa, preferencias)",
            "Responde en el mismo idioma de la conversación.",
          ].join(" "),
        },
        {
          role:    "user",
          content: previousSummary + historyText,
        },
      ],
      max_tokens:  300,
      temperature: 0.3,
    });

    const summary = completion.choices[0]?.message?.content?.trim() ?? null;
    const usage   = completion.usage;

    if (summary) {
      await updateAIContext(userId, conversationId, { summary });
    }

    if (usage) {
      void recordUsage({
        userId,
        conversationId,
        model:            SUMMARY_MODEL,
        operation:        "summary",
        promptTokens:     usage.prompt_tokens,
        completionTokens: usage.completion_tokens ?? 0,
        latencyMs:        Date.now() - start,
      });
    }
  } catch {
    // Summary failures are non-fatal
  }
}
