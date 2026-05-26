// Conversation embeddings pipeline.
// Embeds message content with text-embedding-3-small and stores in pgvector.
// Called asynchronously after a reply is sent — never blocks the AI pipeline.

import { getOpenAI } from "./client.js";
import { recordUsage } from "./metering.js";
import { createAdminClient } from "@/lib/supabase/admin";

const EMBED_MODEL = "text-embedding-3-small";

// ─── Generate a single embedding ─────────────────────────────────────────────

export async function embedText(text: string): Promise<number[]> {
  const openai = getOpenAI();
  const res = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: text.slice(0, 8_191),  // model token limit guard
  });
  return res.data[0]?.embedding ?? [];
}

// ─── Store a message embedding in Supabase ────────────────────────────────────

export async function storeEmbedding(opts: {
  userId:         string;
  conversationId: string;
  messageId?:     string;
  content:        string;
}): Promise<void> {
  const start     = Date.now();
  const embedding = await embedText(opts.content);

  const db = createAdminClient();
  await db.from("conversation_embeddings").insert({
    user_id:         opts.userId,
    conversation_id: opts.conversationId,
    message_id:      opts.messageId ?? null,
    content:         opts.content,
    embedding:       embedding,
  });

  void recordUsage({
    userId:           opts.userId,
    conversationId:   opts.conversationId,
    model:            EMBED_MODEL,
    operation:        "embed",
    promptTokens:     Math.ceil(opts.content.length / 4),
    completionTokens: 0,
    latencyMs:        Date.now() - start,
  });
}

// ─── Embed a user+assistant message pair ─────────────────────────────────────
// Called fire-and-forget after each AI turn.

export async function embedMessagePair(
  userId:         string,
  conversationId: string,
  userText:       string,
  assistantText:  string
): Promise<void> {
  // Combine into a single chunk so semantic search retrieves full exchanges
  const combined = `Cliente: ${userText}\nAsistente: ${assistantText}`;
  await storeEmbedding({ userId, conversationId, content: combined });
}

// ─── RAG: retrieve semantically similar past exchanges ───────────────────────

export interface RAGResult {
  content:    string;
  similarity: number;
}

export async function retrieveRelevantContext(
  userId:         string,
  conversationId: string,
  queryText:      string,
  maxResults = 4
): Promise<RAGResult[]> {
  try {
    const db          = createAdminClient();
    const queryEmbed  = await embedText(queryText);

    // Call the Postgres function defined in the migration
    const { data } = await db.rpc("match_conversation_embeddings", {
      p_user_id:         userId,
      p_conversation_id: conversationId,
      p_query_embedding: queryEmbed as unknown as string,
      p_match_count:     maxResults,
      p_exclude_conv:    true,
    });

    return (data ?? []) as RAGResult[];
  } catch {
    // RAG is best-effort — a failure must never block reply generation
    return [];
  }
}
