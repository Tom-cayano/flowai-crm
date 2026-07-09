// Generación de emails con IA — asunto, contenido y CTA personalizados según
// el objetivo, las etiquetas y el historial del contacto. Devuelve null si la
// IA no está disponible (sin API key / sin cuota) para que el llamador degrade
// a plantillas estáticas.

import { createAdminClient } from "@/lib/supabase/admin";
import { CTA } from "./templates";

export async function composeEmailWithAI(opts: {
  userId:    string;
  contactId: string;
  purpose:   string;
}): Promise<{ subject: string; bodyHtml: string } | null> {
  try {
    const db = createAdminClient();
    const [{ data: contact }, { data: settings }] = await Promise.all([
      db.from("contacts")
        .select("name, tags, custom_fields, source, last_interaction")
        .eq("id", opts.contactId).maybeSingle(),
      db.from("user_ai_settings")
        .select("enabled, model, system_prompt")
        .eq("user_id", opts.userId).maybeSingle(),
    ]);

    if (!contact || !settings?.enabled) return null;

    const custom = (contact.custom_fields ?? {}) as Record<string, unknown>;
    const { getOpenAI } = await import("@/lib/ai/client");
    type Composed = { subject: string; body_paragraphs: string[]; cta_text: string };

    const completion = await getOpenAI().chat.completions.create({
      model: settings.model ?? "gpt-4o-mini",
      max_tokens: 500,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            (settings.system_prompt ?? "Eres el asistente comercial de un gimnasio.") +
            "\nGenera un email breve en español (2-3 párrafos), tono cercano, orientado a la acción. " +
            'Responde SOLO JSON: {"subject": string, "body_paragraphs": string[], "cta_text": string}',
        },
        {
          role: "user",
          content:
            `Propósito del email: ${opts.purpose}\n` +
            `Contacto: ${contact.name} · objetivo: ${custom.goal ?? "desconocido"} · ` +
            `etiquetas: ${(contact.tags ?? []).join(", ") || "ninguna"} · origen: ${contact.source ?? "directo"}`,
        },
      ],
    });

    const result = JSON.parse(completion.choices[0]?.message?.content ?? "null") as Composed | null;
    if (!result?.subject || !result.body_paragraphs?.length) return null;

    const bodyHtml =
      result.body_paragraphs.map((p) => `<p>${p}</p>`).join("\n") +
      CTA(result.cta_text || "Reservar mi valoración gratuita", "https://wa.me/{{telefono_negocio}}");

    return { subject: result.subject, bodyHtml };
  } catch (err) {
    console.error("[email/ai] Generación fallida:", err instanceof Error ? err.message : err);
    return null;
  }
}
