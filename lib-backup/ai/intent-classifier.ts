// AI-powered intent classification using OpenAI.
// Returns the best-matching category plus a confidence score.

import OpenAI from "openai";
import type { IntentResult } from "@/types/automation";

interface ClassifyOptions {
  text:       string;
  categories: string[];
  userId:     string;   // for future rate-limit tracking
}

export async function classifyIntent({
  text,
  categories,
}: ClassifyOptions): Promise<IntentResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[intent-classifier] OPENAI_API_KEY not set");
    return { category: categories[categories.length - 1] ?? "other", confidence: 0, reasoning: "" };
  }

  const openai = new OpenAI({ apiKey });

  const systemPrompt = [
    "Eres un clasificador de intenciones. Responde SOLO con JSON válido.",
    `Categorías disponibles: ${categories.map((c) => `"${c}"`).join(", ")}.`,
    'Formato: {"category":"<nombre>","confidence":<0.0-1.0>,"reasoning":"<1 frase>"}',
  ].join(" ");

  try {
    const completion = await openai.chat.completions.create({
      model:      "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: `Mensaje del cliente: "${text}"` },
      ],
      max_tokens:  100,
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<IntentResult>;
    const category = categories.includes(parsed.category ?? "")
      ? (parsed.category ?? categories[categories.length - 1]!)
      : categories[categories.length - 1]!;

    return {
      category,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      reasoning:  parsed.reasoning ?? "",
    };
  } catch (err) {
    console.error("[intent-classifier] OpenAI error:", err);
    return {
      category:   categories[categories.length - 1] ?? "other",
      confidence: 0,
      reasoning:  "",
    };
  }
}
