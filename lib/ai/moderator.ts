// Response moderation — runs OpenAI's moderation API on every AI-generated
// reply before it reaches the customer. Also enforces custom keyword blocklist.
// Fast and cheap: omni-moderation-latest has no per-token cost.

import { getOpenAI } from "./client.js";
import { recordUsage } from "./metering.js";

export interface ModerationResult {
  flagged:    boolean;
  categories: string[];  // which moderation categories triggered
}

// Company-specific blocklist — extend via env or DB config in a future iteration.
const BLOCKLIST_PATTERNS: RegExp[] = [
  /contraseña|password|senha/i,
  /tarjeta de crédito|credit card|cartão de crédito/i,
  /número de seguro social|social security/i,
];

export async function moderateText(
  text: string,
  userId?: string
): Promise<ModerationResult> {
  // Fast local check first (no API call)
  for (const pattern of BLOCKLIST_PATTERNS) {
    if (pattern.test(text)) {
      return { flagged: true, categories: ["custom_blocklist"] };
    }
  }

  try {
    const openai = getOpenAI();
    const start  = Date.now();

    const result = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: text,
    });

    void recordUsage({
      userId:           userId ?? "system",
      model:            "omni-moderation-latest",
      operation:        "moderate",
      promptTokens:     Math.ceil(text.length / 4),
      completionTokens: 0,
      latencyMs:        Date.now() - start,
    });

    const outcome = result.results[0];
    if (!outcome) return { flagged: false, categories: [] };

    const triggered = Object.entries(outcome.categories)
      .filter(([, v]) => v === true)
      .map(([k]) => k);

    return { flagged: outcome.flagged, categories: triggered };
  } catch {
    // If moderation API is unavailable, allow the message through — do not
    // block the AI reply pipeline on a moderation outage.
    return { flagged: false, categories: [] };
  }
}
