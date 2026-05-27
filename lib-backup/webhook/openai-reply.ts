// ─── OpenAI auto-reply integration ───────────────────────────────────────────
//
// Fetches a conversation's recent history from Supabase and generates a
// context-aware reply using OpenAI Chat Completions.
//
// This module is intentionally pure: it receives all deps as arguments so
// it can be called from the automation engine with any AI settings.

import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HistoryMessage {
  sender: "agent" | "contact";
  content: string;
}

export interface AISettings {
  model: string;
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful and friendly customer service assistant. " +
  "Respond professionally and concisely. Always reply in the same language " +
  "the customer is using. Keep answers brief — no more than 3 short paragraphs.";

const DEFAULT_SETTINGS: AISettings = {
  model: "gpt-4o-mini",
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  maxTokens: 500,
  temperature: 0.7,
};

// ─── History loader ───────────────────────────────────────────────────────────

/**
 * Fetches the most recent messages from a conversation for use as OpenAI
 * context. Ordered oldest → newest so the model sees the thread correctly.
 */
export async function fetchConversationHistory(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  limit = 20
): Promise<HistoryMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("sender, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  // Reverse so oldest message is first (chronological order for OpenAI)
  return data.reverse().map((row) => ({
    sender: row.sender,
    content: row.content,
  }));
}

// ─── Reply generator ──────────────────────────────────────────────────────────

/**
 * Calls OpenAI Chat Completions with the conversation history and the latest
 * incoming message, then returns the generated reply text.
 *
 * Returns null if generation fails or produces an empty response.
 */
export async function generateReply(
  history: HistoryMessage[],
  incomingText: string,
  settings: Partial<AISettings> = {}
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[openai-reply] OPENAI_API_KEY is not set");
    return null;
  }

  const resolved: AISettings = { ...DEFAULT_SETTINGS, ...settings };
  const openai = new OpenAI({ apiKey });

  // Build the message array: system prompt + conversation history + new message
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: resolved.systemPrompt },
    ...history.map<OpenAI.Chat.ChatCompletionMessageParam>((msg) => ({
      role: msg.sender === "agent" ? "assistant" : "user",
      content: msg.content,
    })),
    { role: "user", content: incomingText },
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: resolved.model,
      messages,
      max_tokens: resolved.maxTokens,
      temperature: resolved.temperature,
    });

    return completion.choices[0]?.message?.content?.trim() ?? null;
  } catch (err) {
    console.error("[openai-reply] OpenAI API error:", err);
    return null;
  }
}
