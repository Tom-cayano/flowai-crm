// OpenAI client singleton — import this instead of constructing `new OpenAI()`
// everywhere, so the API key is validated once at module load and the client
// is reused across the process lifetime.

import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

// ─── Cost estimation ──────────────────────────────────────────────────────────
// Prices in USD per million tokens (as of May 2026 — update when pricing changes).

const PRICE_PER_M: Record<string, { input: number; output: number }> = {
  "gpt-4o":              { input: 2.50,  output: 10.00 },
  "gpt-4o-mini":         { input: 0.15,  output: 0.60  },
  "gpt-4.1":             { input: 2.00,  output: 8.00  },
  "gpt-4.1-mini":        { input: 0.40,  output: 1.60  },
  "text-embedding-3-small": { input: 0.02, output: 0   },
  "text-embedding-3-large": { input: 0.13, output: 0   },
  "omni-moderation-latest": { input: 0,    output: 0   },
};

export function estimateCostUSD(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const price = PRICE_PER_M[model] ?? { input: 0.15, output: 0.60 };
  return (
    (promptTokens    / 1_000_000) * price.input +
    (completionTokens / 1_000_000) * price.output
  );
}
