// Smart follow-up generation — produces a re-engagement message for conversations
// that have gone quiet, tailored to the last known context and contact tier.

import { getOpenAI } from "./client";
import { recordUsage } from "./metering";
import { getAIContext } from "./context-manager";

const FOLLOW_UP_MODEL = "gpt-4o-mini";

export interface FollowUpOptions {
  userId:          string;
  conversationId:  string;
  contactName:     string;
  daysSilent:      number;
  lastMessageText: string;
  leadTier?:       string;
  promptId?:       string;
}

export interface FollowUpResult {
  message:     string;
  shouldSend:  boolean;  // false if AI determined follow-up would be intrusive
  reasoning:   string;
}

export async function generateFollowUp(opts: FollowUpOptions): Promise<FollowUpResult> {
  const fallback: FollowUpResult = {
    message:    "",
    shouldSend: false,
    reasoning:  "generation failed",
  };

  try {
    const [openai, ctx] = await Promise.all([
      Promise.resolve(getOpenAI()),
      getAIContext(opts.userId, opts.conversationId),
    ]);

    const contextBlock = ctx.summary
      ? `\nContexto de la conversación:\n${ctx.summary}`
      : "";

    const start = Date.now();

    const completion = await openai.chat.completions.create({
      model:  FOLLOW_UP_MODEL,
      messages: [
        {
          role:    "system",
          content: [
            "Eres un asistente de ventas empático. Genera un mensaje de seguimiento natural",
            "para un cliente que no ha respondido. El mensaje debe ser conciso (1-2 frases),",
            "no invasivo, y en el mismo idioma del cliente.",
            "Responde SOLO con JSON: {\"message\":\"...\",\"shouldSend\":true|false,\"reasoning\":\"...\"}",
            "shouldSend=false si han pasado más de 14 días sin respuesta o el último mensaje fue negativo.",
          ].join(" "),
        },
        {
          role:    "user",
          content: [
            `Cliente: ${opts.contactName}`,
            `Días sin respuesta: ${opts.daysSilent}`,
            `Último mensaje del cliente: "${opts.lastMessageText.slice(0, 500)}"`,
            opts.leadTier ? `Calificación del lead: ${opts.leadTier}` : "",
            contextBlock,
          ].filter(Boolean).join("\n"),
        },
      ],
      max_tokens:      150,
      temperature:     0.6,
      response_format: { type: "json_object" },
    });

    const raw    = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<FollowUpResult>;
    const usage  = completion.usage;

    if (usage) {
      void recordUsage({
        userId:           opts.userId,
        conversationId:   opts.conversationId,
        model:            FOLLOW_UP_MODEL,
        operation:        "follow_up",
        promptTokens:     usage.prompt_tokens,
        completionTokens: usage.completion_tokens ?? 0,
        latencyMs:        Date.now() - start,
      });
    }

    return {
      message:    parsed.message    ?? "",
      shouldSend: parsed.shouldSend ?? false,
      reasoning:  parsed.reasoning  ?? "",
    };
  } catch {
    return fallback;
  }
}
