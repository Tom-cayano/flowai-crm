// Semantic CRM search — hybrid NL + embedding search over conversations and contacts.
// Embeds the query, runs pgvector similarity search, then merges with text results.

import { embedText } from "./embeddings";
import { createAdminClient } from "@/lib/supabase/admin";

export interface SemanticResult {
  id:         string;
  type:       "conversation" | "contact" | "message";
  title:      string;
  preview:    string;
  similarity: number;   // 0–1 cosine similarity (1 = identical)
  metadata:   Record<string, string | number | boolean | null>;
}

export interface SemanticSearchOptions {
  userId:     string;
  query:      string;
  maxResults?: number;
  types?:      Array<"conversation" | "contact" | "message">;
}

export async function semanticSearch(opts: SemanticSearchOptions): Promise<SemanticResult[]> {
  const { userId, query, maxResults = 10 } = opts;

  const db = createAdminClient();

  // Embed query + run text-based contact/conversation search in parallel
  const [queryEmbedding, { data: textConversations }, { data: textContacts }] =
    await Promise.all([
      embedText(query),
      db
        .from("conversations")
        .select("id, contact_id, status, updated_at")
        .eq("user_id", userId)
        .textSearch("status", query, { type: "plain" })
        .limit(5),
      db
        .from("contacts")
        .select("id, name, phone, email")
        .eq("user_id", userId)
        .or(`name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(5),
    ]);

  // Vector search over message embeddings
  const { data: vectorMatches } = await db.rpc("match_conversation_embeddings", {
    p_user_id:         userId,
    p_conversation_id: "", // empty = no exclusion filter needed here
    p_query_embedding: queryEmbedding as unknown as string,
    p_match_count:     maxResults,
    p_exclude_conv:    false,
  });

  const results: SemanticResult[] = [];

  // Merge vector matches
  for (const match of (vectorMatches ?? []) as Array<{ content: string; similarity: number; conversation_id?: string }>) {
    results.push({
      id:         match.conversation_id ?? crypto.randomUUID(),
      type:       "message",
      title:      "Mensaje relevante",
      preview:    match.content.slice(0, 120),
      similarity: match.similarity,
      metadata:   { conversation_id: match.conversation_id ?? null },
    });
  }

  // Merge text-matched contacts
  for (const contact of (textContacts ?? [])) {
    results.push({
      id:         contact.id,
      type:       "contact",
      title:      contact.name ?? contact.phone ?? "Contacto",
      preview:    [contact.phone, contact.email].filter(Boolean).join(" · "),
      similarity: 0.75, // Text match — fixed relevance
      metadata:   { phone: contact.phone ?? null, email: contact.email ?? null },
    });
  }

  // Merge text-matched conversations (deduplicated by id)
  const seen = new Set(results.map((r) => r.id));
  for (const conv of (textConversations ?? [])) {
    if (seen.has(conv.id)) continue;
    results.push({
      id:         conv.id,
      type:       "conversation",
      title:      `Conversación · ${conv.status ?? ""}`,
      preview:    `Actualizado: ${conv.updated_at ? new Date(conv.updated_at).toLocaleDateString() : "—"}`,
      similarity: 0.7,
      metadata:   { status: conv.status ?? null, contact_id: conv.contact_id ?? null },
    });
  }

  // Sort by similarity desc, cap at maxResults
  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxResults);
}
