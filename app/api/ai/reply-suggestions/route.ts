// POST /api/ai/reply-suggestions
// Returns 3 quick reply chip suggestions as a single JSON response.
// Pattern: auth → quota check → DB history → OpenAI → JSON response.
// Intentionally non-streaming (chips are short) for simpler frontend integration.
// Cache key: ai:reply-sugg:<conversationId> — distinct from copilot suggestions cache.

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOpenAI } from "@/lib/ai/client";
import { recordUsage } from "@/lib/ai/metering";
import { getCachedAI, setCachedAI } from "@/lib/ai/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { isWithinQuota, incrementUsage } from "@/lib/billing/usage";

export const dynamic = "force-dynamic";

const MODEL    = "gpt-4o-mini";
const CACHE_TTL = 90; // seconds — short: suggestions are message-specific

interface ReplySuggestion {
  text:  string;
  emoji: string;
}

interface SuggestionsResponse {
  suggestions: ReplySuggestion[];
}

// Canonical cache key for reply chips (separate namespace from copilot)
function replyChipKey(conversationId: string, lastMessageHash: string) {
  return `ai:reply-sugg:${conversationId}:${lastMessageHash.slice(0, 32)}`;
}

function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

export async function POST(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const body = await req.json() as {
    conversationId: string;
    lastMessage:    string;
    forceRefresh?:  boolean;
    workspaceId?:   string;
  };

  const { conversationId, lastMessage, forceRefresh = false } = body;

  if (!conversationId || !lastMessage?.trim()) {
    return new Response(
      JSON.stringify({ error: "Missing conversationId or lastMessage" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Cache lookup ──────────────────────────────────────────────────────────
  const cacheKey = replyChipKey(conversationId, hashString(lastMessage));
  if (!forceRefresh) {
    const cached = await getCachedAI<SuggestionsResponse>(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        headers: { "Content-Type": "application/json" },
      });
    }
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

  // ── Load recent message history (last 8 messages for context) ─────────────
  const db = createAdminClient();
  const { data: msgs } = await db
    .from("messages")
    .select("sender, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(8);

  const history = (msgs ?? [])
    .reverse()
    .map((m) => `${m.sender === "agent" ? "Agente" : "Cliente"}: ${m.content}`)
    .join("\n");

  // ── OpenAI: generate 3 quick reply chips ──────────────────────────────────
  const openai = getOpenAI();
  const start  = Date.now();

  try {
    const completion = await openai.chat.completions.create({
      model:           MODEL,
      max_tokens:      300,
      temperature:     0.5,
      response_format: { type: "json_object" },
      messages: [
        {
          role:    "system",
          content: [
            "Eres un asistente de agente de ventas/soporte.",
            "Genera exactamente 3 respuestas rápidas (chips) para el agente, basadas en el último mensaje del cliente.",
            "Cada chip debe ser CORTO (máx 10 palabras), natural y listo para enviar.",
            "Varía los tonos: una formal, una amigable, una de acción concreta.",
            "Responde SOLO con JSON válido en este formato exacto:",
            '{"suggestions":[{"text":"<respuesta>","emoji":"<1 emoji relevante>"},{"text":"<respuesta>","emoji":"<1 emoji>"},{"text":"<respuesta>","emoji":"<1 emoji>"}]}',
            "Los emojis deben ser relevantes al contexto (👋 saludo, ✅ confirmación, 📅 cita, 💬 info, etc.).",
            "Responde siempre en el idioma de la conversación.",
          ].join(" "),
        },
        {
          role:    "user",
          content: `Historial reciente:\n${history}\n\nÚltimo mensaje del cliente: ${lastMessage}\n\nGenera los 3 chips:`,
        },
      ],
    });

    const raw    = completion.choices[0]?.message?.content ?? "{}";
    const usage  = completion.usage;
    let parsed: Partial<SuggestionsResponse> = {};

    try {
      parsed = JSON.parse(raw) as Partial<SuggestionsResponse>;
    } catch {
      parsed = { suggestions: [] };
    }

    const result: SuggestionsResponse = {
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions.slice(0, 3).map((s) => ({
            text:  String(s.text  ?? "").slice(0, 120),
            emoji: String(s.emoji ?? "💬").slice(0, 4),
          }))
        : [],
    };

    // ── Cache + metering (fire-and-forget) ───────────────────────────────────
    void setCachedAI(cacheKey, result, CACHE_TTL);

    if (usage) {
      void recordUsage({
        userId:           user.id,
        conversationId,
        model:            MODEL,
        operation:        "suggest",
        promptTokens:     usage.prompt_tokens,
        completionTokens: usage.completion_tokens ?? 0,
        latencyMs:        Date.now() - start,
      });
    }

    if (workspaceId) {
      void incrementUsage(workspaceId, "ai_credits_used");
    }

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[reply-suggestions] OpenAI error:", err);
    return new Response(
      JSON.stringify({ error: "Error al generar sugerencias", suggestions: [] }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
