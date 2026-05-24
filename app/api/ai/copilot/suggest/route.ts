// POST /api/ai/copilot/suggest
// Returns suggested replies as a streaming SSE response.
// Checks ai_credits quota BEFORE opening the stream; increments after completion.

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOpenAI } from "@/lib/ai/client";
import { recordUsage } from "@/lib/ai/metering";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { isWithinQuota, incrementUsage } from "@/lib/billing/usage";

export const dynamic = "force-dynamic";

const MODEL = "gpt-4o-mini";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = await req.json() as {
    conversationId: string;
    lastMessage:    string;
    tone?:          "professional" | "friendly" | "empathetic";
    workspaceId?:   string;
  };

  const { conversationId, lastMessage, tone = "professional" } = body;
  if (!conversationId || !lastMessage) {
    return new Response("Missing conversationId or lastMessage", { status: 400 });
  }

  // ── Quota check (fail open on resolution failure) ─────────────────────────
  const workspaceId = body.workspaceId ?? await getUserPrimaryWorkspace(user.id);
  if (workspaceId) {
    const withinQuota = await isWithinQuota(workspaceId, "ai_credits");
    if (!withinQuota) {
      return new Response(
        JSON.stringify({ error: "Límite de créditos IA alcanzado. Actualiza tu plan.", code: "QUOTA_EXCEEDED" }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  const db = createAdminClient();
  const { data: msgs } = await db
    .from("messages")
    .select("sender, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(10);

  const history = (msgs ?? [])
    .reverse()
    .map((m) => `${m.sender === "agent" ? "Agente" : "Cliente"}: ${m.content}`)
    .join("\n");

  const TONE_MAP = {
    professional: "formal y orientado a soluciones",
    friendly:     "cálido y conversacional",
    empathetic:   "comprensivo y empático",
  };

  const openai = getOpenAI();
  const start  = Date.now();

  const stream = await openai.chat.completions.create({
    model: MODEL,
    stream: true,
    messages: [
      {
        role:    "system",
        content: `Eres un asistente de agente de ventas/soporte. Genera UNA respuesta en tono ${TONE_MAP[tone]} al último mensaje del cliente. ` +
                 "La respuesta debe ser concisa (máx 3 oraciones), relevante al contexto y lista para enviar. " +
                 "Responde directamente con el texto de la respuesta (sin JSON, sin prefijos).",
      },
      {
        role:    "user",
        content: `Historial:\n${history}\n\nÚltimo mensaje del cliente: ${lastMessage}\n\nGenera la respuesta:`,
      },
    ],
    max_tokens:  250,
    temperature: 0.4,
  });

  let totalPromptTokens     = 0;
  let totalCompletionTokens = 0;

  const readable = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
          }
          const usage = chunk.usage;
          if (usage) {
            totalPromptTokens     = usage.prompt_tokens;
            totalCompletionTokens = usage.completion_tokens ?? 0;
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } finally {
        controller.close();
        // Fire-and-forget: metering + quota increment must never block the stream
        void recordUsage({
          userId:           user.id,
          conversationId,
          model:            MODEL,
          operation:        "suggest",
          promptTokens:     totalPromptTokens,
          completionTokens: totalCompletionTokens,
          latencyMs:        Date.now() - start,
        });
        if (workspaceId) {
          void incrementUsage(workspaceId, "ai_credits_used");
        }
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}
