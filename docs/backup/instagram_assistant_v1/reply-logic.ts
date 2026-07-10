// Lógica PURA de decisión del asistente de Instagram.
//
// Única fuente de verdad para: qué comentario/DM merece respuesta, qué guardas
// lo bloquean y qué texto responder según la intención. Sin dependencias (ni
// BD, ni red) → 100% testeable. Los procesadores/puente sólo la invocan.
//
// ⚠️  MÓDULO ESTABLE DE PRODUCCIÓN — versión instagram_assistant_v1 (2026-07-10).
//     No modificar directamente en producción. Ver docs/instagram-assistant.md.

/** Versión estable congelada del asistente de Instagram. */
export const INSTAGRAM_ASSISTANT_VERSION = "instagram_assistant_v1";

// ─── Normalización + keywords (mismo criterio que el recepcionista de WhatsApp) ─

/** minúsculas, sin acentos, sin signos, espacios colapsados. */
export function normalize(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** coincidencia por palabra/límite (evita falsos positivos dentro de otra palabra). */
function matchesKeyword(normalizedText: string, keyword: string): boolean {
  const k = normalize(keyword);
  if (!k) return false;
  const re = new RegExp(`(^|\\s)${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`);
  return re.test(normalizedText);
}

// ─── Clasificación de intención ────────────────────────────────────────────────

export type IGIntent = "precio" | "info" | "generic";

const PRECIO_KEYWORDS = [
  "precio", "precios", "cuanto", "cuanto cuesta", "coste", "costo", "tarifa",
  "tarifas", "vale", "cuota", "pagar", "price", "cuanto vale",
];
const INFO_KEYWORDS = [
  "info", "informacion", "mas info", "quiero info", "detalles", "saber mas",
  "interesado", "interesada", "me interesa", "como funciona", "quiero saber",
];

/**
 * Clasifica el texto de un comentario o DM. "precio" tiene prioridad sobre
 * "info" (una consulta de precio es más específica). Sin coincidencia → generic.
 */
export function classifyIntent(text: string): IGIntent {
  const t = normalize(text);
  if (PRECIO_KEYWORDS.some((k) => matchesKeyword(t, k))) return "precio";
  if (INFO_KEYWORDS.some((k) => matchesKeyword(t, k)))  return "info";
  return "generic";
}

// ─── Guardas del disparador ─────────────────────────────────────────────────────

export interface CommentGuardInput {
  fromIgUserId:    string;          // autor del comentario
  accountIgUserId: string;          // dueño de la cuenta (nuestra propia cuenta)
  timestampMs:     number;          // momento del comentario (epoch ms)
  nowMs?:          number;          // ahora (inyectable para tests)
  replyAlreadySent?: boolean;       // ya respondido (instagram_comment_events.reply_sent)
  maxAgeMs?:       number;          // ventana de frescura (por defecto 24 h)
}

export type GuardDecision =
  | { process: true }
  | { process: false; reason: "self-comment" | "already-replied" | "stale-comment" | "empty" };

/**
 * Decide si un comentario debe generar respuesta. Bloquea:
 *   • comentarios de la propia cuenta (evita bucle de auto-respuesta),
 *   • comentarios ya respondidos (evita responder dos veces),
 *   • comentarios antiguos (reprocesos/sincronización) fuera de la ventana.
 */
export function shouldReplyToComment(text: string, g: CommentGuardInput): GuardDecision {
  const now      = g.nowMs ?? Date.now();
  const maxAge    = g.maxAgeMs ?? 24 * 60 * 60 * 1000; // 24 h
  if (!normalize(text)) return { process: false, reason: "empty" };
  if (g.fromIgUserId && g.accountIgUserId && g.fromIgUserId === g.accountIgUserId) {
    return { process: false, reason: "self-comment" };
  }
  if (g.replyAlreadySent) return { process: false, reason: "already-replied" };
  if (Number.isFinite(g.timestampMs) && now - g.timestampMs > maxAge) {
    return { process: false, reason: "stale-comment" };
  }
  return { process: true };
}

export interface DMGuardInput {
  isEcho:       boolean;            // mensaje emitido por la propia página
  alreadySeenMid?: boolean;         // mid ya procesado (idempotencia)
}

export type DMGuardDecision =
  | { process: true }
  | { process: false; reason: "echo" | "duplicate" | "empty" };

/** Decide si un DM entrante debe procesarse. Bloquea ecos y duplicados. */
export function shouldReplyToDM(text: string, g: DMGuardInput): DMGuardDecision {
  if (g.isEcho) return { process: false, reason: "echo" };
  if (g.alreadySeenMid) return { process: false, reason: "duplicate" };
  if (!normalize(text)) return { process: false, reason: "empty" };
  return { process: true };
}

// ─── Copys por defecto (editables vía instagram_config; fallback aquí) ───────────

export interface IGReplyConfig {
  commentPrecio: string;
  commentInfo:   string;
  commentGeneric: string;
  dmPrecio:      string;
  dmInfo:        string;
  dmGeneric:     string;
}

export const DEFAULT_IG_COPY: IGReplyConfig = {
  commentPrecio:  "¡Gracias por tu interés! 💬 Te acabamos de escribir por privado con los precios y todos los detalles.",
  commentInfo:    "¡Gracias por comentar! 📩 Te enviamos toda la información por mensaje privado.",
  commentGeneric: "¡Gracias por tu comentario! 📩 Te escribimos por privado para ayudarte.",
  dmPrecio:       "¡Hola! 👋 Encantados de ayudarte. Estos son nuestros planes y precios:\n\n• Plan mensual\n• Plan trimestral\n• Plan anual\n\n¿Quieres que te detalle alguno o prefieres reservar una valoración gratuita?",
  dmInfo:         "¡Hola! 👋 Gracias por tu interés. Te contamos cómo funciona y resolvemos cualquier duda. ¿Buscas entrenamiento presencial o online?",
  dmGeneric:      "¡Hola! 👋 Gracias por escribirnos. ¿En qué podemos ayudarte? Cuéntanos qué buscas y te asesoramos.",
};

/** Texto de respuesta a un COMENTARIO según intención. */
export function commentReply(intent: IGIntent, cfg: IGReplyConfig = DEFAULT_IG_COPY): string {
  return intent === "precio" ? cfg.commentPrecio
       : intent === "info"   ? cfg.commentInfo
       :                        cfg.commentGeneric;
}

/** Texto de respuesta a un DM según intención. */
export function dmReply(intent: IGIntent, cfg: IGReplyConfig = DEFAULT_IG_COPY): string {
  return intent === "precio" ? cfg.dmPrecio
       : intent === "info"   ? cfg.dmInfo
       :                        cfg.dmGeneric;
}
