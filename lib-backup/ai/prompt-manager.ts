// Prompt template management — resolves the right system prompt for an AI call.

import { createAdminClient } from "@/lib/supabase/admin";

export interface ResolvedPrompt {
  systemPrompt: string;
  model:        string;
  maxTokens:    number;
  temperature:  number;
}

const DEFAULTS: ResolvedPrompt = {
  systemPrompt: [
    "Eres un asistente de atención al cliente amable y profesional.",
    "Responde siempre en el mismo idioma que usa el cliente.",
    "Sé conciso — máximo 3 párrafos cortos.",
    "Si no sabes la respuesta, díselo honestamente y ofrece escalar al equipo.",
  ].join(" "),
  model:        "gpt-4o-mini",
  maxTokens:    500,
  temperature:  0.7,
};

/** Resolve a prompt by id, or fall back to the user's default, or system defaults. */
export async function resolvePrompt(
  userId: string,
  promptId?: string
): Promise<ResolvedPrompt> {
  const db = createAdminClient();

  let query = db
    .from("ai_prompts")
    .select("system_prompt, model, max_tokens, temperature")
    .eq("user_id", userId);

  if (promptId) {
    query = query.eq("id", promptId);
  } else {
    query = query.eq("is_default", true);
  }

  const { data } = await query.maybeSingle();

  if (data) {
    return {
      systemPrompt: data.system_prompt,
      model:        data.model,
      maxTokens:    data.max_tokens,
      temperature:  Number(data.temperature),
    };
  }

  // Also check user_ai_settings for backwards-compat with old system
  const { data: legacySettings } = await db
    .from("user_ai_settings")
    .select("enabled, model, system_prompt, max_tokens, temperature")
    .eq("user_id", userId)
    .maybeSingle();

  if (legacySettings?.enabled) {
    return {
      systemPrompt: legacySettings.system_prompt ?? DEFAULTS.systemPrompt,
      model:        legacySettings.model ?? DEFAULTS.model,
      maxTokens:    legacySettings.max_tokens ?? DEFAULTS.maxTokens,
      temperature:  Number(legacySettings.temperature ?? DEFAULTS.temperature),
    };
  }

  return DEFAULTS;
}

/** Interpolate {{variable}} placeholders in a prompt. */
export function interpolatePrompt(
  template: string,
  variables: Record<string, string | number | boolean>
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    return String(variables[key.trim()] ?? "");
  });
}
