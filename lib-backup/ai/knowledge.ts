// AI Knowledge System — smart canned responses and FAQ generation.
// Retrieves relevant canned responses via embedding similarity, then
// optionally adapts them with GPT if the match score is too low.

import { embedText, retrieveRelevantContext } from "./embeddings";
import { getOpenAI } from "./client";
import { recordUsage } from "./metering";
import { createAdminClient } from "@/lib/supabase/admin";

const MODEL = "gpt-4o-mini";
const ADAPT_THRESHOLD = 0.78; // below this similarity, adapt the canned response

export interface KnowledgeResult {
  text:       string;
  source:     "canned_exact" | "canned_adapted" | "generated" | "rag";
  similarity: number;
  cannedId?:  string;
}

export interface FAQItem {
  question: string;
  answer:   string;
}

// ─── Smart canned response retrieval ─────────────────────────────────────────

export async function findRelevantResponse(opts: {
  query:           string;
  userId:          string;
  conversationId:  string;
  contactContext?: string;
}): Promise<KnowledgeResult | null> {
  const db = createAdminClient();

  // canned_responses is not yet in the generated Supabase types — use cast
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: canned } = await (db as any)
    .from("canned_responses")
    .select("id, title, content")
    .eq("user_id", opts.userId)
    .ilike("content", `%${opts.query.slice(0, 60)}%`)
    .limit(3) as { data: Array<{ id: string; title: string; content: string }> | null };

  if (canned && canned.length > 0) {
    const [queryVec, cannedVec] = await Promise.all([
      embedText(opts.query),
      embedText(canned[0].content),
    ]);

    const similarity = cosineSimilarity(queryVec, cannedVec);

    if (similarity >= ADAPT_THRESHOLD) {
      return {
        text:     canned[0].content,
        source:   "canned_exact",
        similarity,
        cannedId: canned[0].id,
      };
    }

    const adapted = await adaptCannedResponse({
      cannedText:     canned[0].content,
      query:          opts.query,
      contactContext: opts.contactContext,
      userId:         opts.userId,
      conversationId: opts.conversationId,
    });

    if (adapted) {
      return {
        text:     adapted,
        source:   "canned_adapted",
        similarity,
        cannedId: canned[0].id,
      };
    }
  }

  // Fall back to RAG — retrieve relevant past conversation context
  const ragResults = await retrieveRelevantContext(
    opts.userId,
    opts.conversationId,
    opts.query,
    3
  );

  if (ragResults.length > 0) {
    const best = ragResults[0];
    return {
      text:       best.content,
      source:     "rag",
      similarity: best.similarity,
    };
  }

  return null;
}

// ─── Adapt a canned response to a specific query ──────────────────────────────

async function adaptCannedResponse(opts: {
  cannedText:      string;
  query:           string;
  contactContext?: string;
  userId:          string;
  conversationId:  string;
}): Promise<string | null> {
  const openai = getOpenAI();
  const start  = Date.now();

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role:    "system",
          content: [
            "Adapta la siguiente respuesta predefinida para responder mejor la consulta específica del cliente.",
            "Mantén el tono y la esencia del texto original. Solo ajusta para hacerlo más relevante.",
            opts.contactContext ? `Contexto del cliente: ${opts.contactContext}` : "",
            'Responde SOLO con JSON: {"adapted":"<texto adaptado>"}',
          ].filter(Boolean).join(" "),
        },
        {
          role:    "user",
          content: `Consulta del cliente: ${opts.query}\n\nRespuesta predefinida: ${opts.cannedText}`,
        },
      ],
      max_tokens:      300,
      temperature:     0.3,
      response_format: { type: "json_object" },
    });

    const raw    = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { adapted?: string };
    const usage  = completion.usage;

    if (usage) {
      void recordUsage({
        userId:           opts.userId,
        conversationId:   opts.conversationId,
        model:            MODEL,
        operation:        "knowledge",
        promptTokens:     usage.prompt_tokens,
        completionTokens: usage.completion_tokens ?? 0,
        latencyMs:        Date.now() - start,
      });
    }

    return parsed.adapted ?? null;
  } catch {
    return null;
  }
}

// ─── FAQ generation from conversation history ─────────────────────────────────
// Messages are scoped to a user via their conversations (no direct user_id column).

export async function generateFAQ(opts: {
  userId:    string;
  maxItems?: number;
}): Promise<FAQItem[]> {
  const db       = createAdminClient();
  const maxItems = opts.maxItems ?? 8;

  // Get recent conversation IDs for this user first
  const { data: convs } = await db
    .from("conversations")
    .select("id")
    .eq("user_id", opts.userId)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (!convs || convs.length === 0) return [];

  const convIds = convs.map((c) => c.id);

  const { data: msgs } = await db
    .from("messages")
    .select("content")
    .in("conversation_id", convIds)
    .eq("sender", "contact")
    .order("created_at", { ascending: false })
    .limit(100);

  if (!msgs || msgs.length === 0) return [];

  const sampleMessages = msgs
    .map((m) => m.content)
    .filter((c): c is string => typeof c === "string" && c.length > 10)
    .slice(0, 50)
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
            `Analiza estos mensajes de clientes y genera las ${maxItems} preguntas frecuentes más importantes con sus respuestas sugeridas.`,
            'Responde SOLO con JSON válido: {"faqs":[{"question":"<pregunta>","answer":"<respuesta>"},...]}',
            "Las respuestas deben ser útiles, concisas y listas para usar como respuestas predefinidas.",
            "Responde en el idioma predominante de los mensajes.",
          ].join(" "),
        },
        { role: "user", content: sampleMessages.slice(0, 4_000) },
      ],
      max_tokens:      1_200,
      temperature:     0.3,
      response_format: { type: "json_object" },
    });

    const raw    = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { faqs?: FAQItem[] };
    const usage  = completion.usage;

    if (usage) {
      void recordUsage({
        userId:           opts.userId,
        conversationId:   "faq-gen",
        model:            MODEL,
        operation:        "knowledge",
        promptTokens:     usage.prompt_tokens,
        completionTokens: usage.completion_tokens ?? 0,
        latencyMs:        Date.now() - start,
      });
    }

    return Array.isArray(parsed.faqs) ? parsed.faqs.slice(0, maxItems) : [];
  } catch {
    return [];
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
