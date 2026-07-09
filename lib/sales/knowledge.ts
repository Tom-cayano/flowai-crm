// Conocimiento comercial de Love Fitness Murcia / Transforma Fit Coach.
// Única fuente de verdad para precios, horarios, copys y clasificación de
// intención del asistente comercial. Sin dependencias — puro y testeable.

// ─── Clasificación de flujo ───────────────────────────────────────────────────

export type SalesFlow = "online" | "presencial";

const ONLINE_KEYWORDS = [
  "entrenamiento online", "entrenador online", "online",
  "perder peso", "bajar de peso", "adelgazar",
  "ganar masa muscular", "masa muscular", "ganar musculo", "ganar músculo",
  "nutricion", "nutrición", "dieta",
  "app", "aplicacion", "aplicación",
  "plan personalizado", "lipedema", "tonificar",
];

const PRESENCIAL_KEYWORDS = [
  "interesado en vuestra oferta", "interesada en vuestra oferta",
  "quiero informacion", "quiero información", "mas informacion", "más información",
  "cuanto cuesta", "cuánto cuesta", "precio", "precios", "tarifa",
  "horario", "horarios",
  "gimnasio", "gym", "murcia", "presencial",
  "quiero apuntarme", "apuntarme", "inscribirme",
  "clase de prueba",
];

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Coincidencia por límites de palabra: evita falsos positivos de subcadenas
 * ("app" dentro de "whatsapp", "gym" dentro de "gymkhana").
 */
function matchesKeyword(normalizedText: string, keyword: string): boolean {
  const k = normalize(keyword).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${k}([^a-z0-9]|$)`).test(normalizedText);
}

/**
 * Clasifica el mensaje en un flujo. Online gana en caso de empate porque sus
 * señales (objetivos físicos) son más específicas que las genéricas de precio.
 */
export function classifyFlow(text: string): SalesFlow | null {
  const t = normalize(text);
  const onlineHit     = ONLINE_KEYWORDS.some((k) => matchesKeyword(t, k));
  const presencialHit = PRESENCIAL_KEYWORDS.some((k) => matchesKeyword(t, k));
  if (onlineHit) return "online";
  if (presencialHit) return "presencial";
  return null;
}

/** ¿El mensaje pregunta por precios o por horarios? (responder + reconducir) */
export function detectInfoQuestion(text: string): "precios" | "horarios" | null {
  const t = normalize(text);
  if (["cuanto cuesta", "precio", "tarifa", "cuanto vale", "mensualidad"].some((k) => t.includes(k))) return "precios";
  if (["horario", "a que hora abris", "cuando abris", "open box"].some((k) => t.includes(k))) return "horarios";
  return null;
}

/** Extrae una elección numérica (1-9) del mensaje: "1", "1️⃣", "la 2", "opcion 3"… */
export function parseNumericChoice(text: string, max: number): number | null {
  const t = normalize(text).replace(/️|⃣/g, ""); // quita variantes emoji
  const emojiMap: Record<string, number> = { "1⃣": 1, "2⃣": 2, "3⃣": 3, "4⃣": 4, "5⃣": 5, "6⃣": 6 };
  for (const [e, n] of Object.entries(emojiMap)) {
    if (t.includes(e) && n <= max) return n;
  }
  const wordMap: Record<string, number> = {
    uno: 1, primera: 1, primero: 1,
    dos: 2, segunda: 2, segundo: 2,
    tres: 3, tercera: 3, tercero: 3,
    cuatro: 4, cuarta: 4, cuarto: 4,
    cinco: 5, seis: 6,
  };
  const m = t.match(/\b([1-9])\b/);
  if (m) {
    const n = Number(m[1]);
    return n >= 1 && n <= max ? n : null;
  }
  for (const [w, n] of Object.entries(wordMap)) {
    if (new RegExp(`\\b${w}\\b`).test(t) && n <= max) return n;
  }
  // Atajos semánticos del flujo online
  if (/videollamada|video/.test(t) && max >= 1) return 1;
  if (/telefon|llamada|telefono/.test(t) && max >= 2) return 2;
  return null;
}

// ─── Precios y horarios ───────────────────────────────────────────────────────

export const PRICING_TEXT = `💪 *Nuestros planes:*
1️⃣ Entrenamiento grupal — 59 €/mes (L-V + Open Box 24 h/365 días)
2️⃣ Funcional — 39,99 €/mes (3 días/semana, guiado por App)
3️⃣ Personal Trainer — 180 €/mes (3 sesiones/sem + dieta + 3 Tesla Slimming)
4️⃣ PT Premium — 250 €/mes (5 sesiones/sem + dieta + 4 Tesla Slimming + flexibilidad)`;

export const SCHEDULE_TEXT = `🕐 *Horarios Love Fitness Murcia:*
Open Box: 24 h, 365 días (clientes con esa modalidad)
Invierno: L-V 07:00-13:00 y 16:00-22:00
Verano: 07:00-13:00 y 17:00-21:00`;

// ─── Huecos de agenda ─────────────────────────────────────────────────────────

/** Horas ofertables para valoraciones y clases de prueba. */
export const BOOKABLE_HOURS = [10, 11, 12, 17, 18, 21];

// ─── Copys del funnel (máx. 4 líneas, una sola pregunta, opciones numeradas) ──

export const COPY = {
  askFlow:
    "¡Hola! 😊 Soy del equipo de Love Fitness Murcia.\n" +
    "¿Qué te interesa?\n" +
    "1️⃣ Entrenamiento online personalizado\n" +
    "2️⃣ Nuestro gimnasio en Murcia",

  onlineGreeting: (nombre: string) =>
    `¡Hola, ${nombre}! 😊\n\n` +
    "Gracias por contactar con Transforma Fit Coach.\n\n" +
    "Antes de empezar ofrecemos una valoración totalmente gratuita de 10-15 minutos " +
    "para conocer tu objetivo y explicarte cómo podemos ayudarte.\n\n" +
    "¿Prefieres?\n\n1️⃣ Videollamada\n\n2️⃣ Llamada telefónica",

  presencialPitch:
    "¡Perfecto! 😊\n\n" +
    "Puedes conocer nuestro gimnasio mediante una clase de prueba.\n\n" +
    "Precio: 10€\n\n" +
    "Si decides apuntarte ese mismo día esos 10€ se descuentan completamente y la clase será gratuita.",

  askSlot: (slots: string[]) =>
    "¿Qué horario prefieres?\n" + slots.map((s, i) => `${i + 1}️⃣ ${s}`).join("\n"),

  reofferChannel:
    "¿Cómo prefieres la valoración gratuita?\n1️⃣ Videollamada\n2️⃣ Llamada telefónica",

  slotTaken:
    "Ese hueco se acaba de ocupar 😅 Estos siguen libres:",

  confirmOnline: (fecha: string, canal: "video" | "llamada", meetLink: string | null) =>
    `✅ ¡Reservado! Tu valoración gratuita es el ${fecha}` +
    (canal === "video"
      ? meetLink
        ? `.\n📹 Enlace de la videollamada: ${meetLink}`
        : ".\n📹 Te enviaremos el enlace de la videollamada antes de la cita."
      : ".\n📞 Te llamaremos a este número.") +
    "\nTe recordaremos la cita 24 h y 1 h antes. ¡Nos vemos! 💪",

  confirmPresencial: (fecha: string) =>
    `✅ ¡Reservada tu clase de prueba el ${fecha}!\n` +
    "📍 Love Fitness Murcia. Trae ropa deportiva y agua.\n" +
    "Recuerda: si te apuntas ese día, los 10€ se descuentan y la clase sale gratis.\n" +
    "Te recordaremos la cita 24 h y 1 h antes. 💪",

  reminder24h: (fecha: string, kind: string) =>
    `⏰ Recordatorio: mañana tienes ${kind} (${fecha}) con Love Fitness Murcia.\n` +
    "Si necesitas cambiarla, respóndenos por aquí. ¡Te esperamos! 💪",

  reminder1h: (kind: string) =>
    `⏰ ¡En 1 hora tienes ${kind} con Love Fitness Murcia! 💪`,

  afterBooked:
    "¡Tu cita ya está reservada! ✅ Si necesitas cambiarla o tienes cualquier duda, dímelo por aquí.",

  fallbackNudge:
    "Para avanzar rápido, respóndeme con el número de la opción que prefieras 😊",
} as const;

// ─── V2: menú de WhatsApp directo, planes y recuperación ─────────────────────

export const DIRECT_MENU =
  "¡Hola! 👋 Soy el asistente de Love Fitness Murcia.\n\n" +
  "¿Sobre qué te gustaría recibir información?\n\n" +
  "1️⃣ Entrenamiento grupal\n2️⃣ Entrenamiento funcional\n3️⃣ Personal Trainer\n" +
  "4️⃣ Entrenamiento online\n5️⃣ Horarios\n6️⃣ Reservar clase de prueba";

export const PLAN_DETAILS: Record<number, string> = {
  1: "💪 *Entrenamiento grupal — 59€/mes*\nEntrenamientos de lunes a viernes.\nIncluye Open Box 24 horas los 365 días.",
  2: "🏃 *Entrenamiento funcional — 39,99€/mes*\n3 días por semana.\nEntrenamientos guiados desde la App.\nNo incluye Open Box.",
  3: "🎯 *Personal Trainer — 180€/mes*\n3 entrenamientos personales por semana.\nIncluye dieta personalizada y 3 sesiones Tesla Slimming.",
  4: "⭐ *Personal Trainer Premium — 250€/mes*\n5 entrenamientos personales por semana.\nIncluye dieta personalizada, 4 sesiones Tesla Slimming y horario flexible.",
};

export const AFTER_PLAN_CTA =
  "¿Quieres venir a conocerlo?\n1️⃣ Reservar clase de prueba (10€, gratis si te apuntas ese día)\n2️⃣ Ver otro plan";

/** Detecta "ahora no puedo / más adelante / no tengo tiempo" — no insistir. */
export function detectSnooze(text: string): boolean {
  const t = normalize(text);
  return [
    "ahora no puedo", "no puedo ahora", "mas adelante", "más adelante",
    "no tengo tiempo", "otro momento", "otro dia", "ahora no",
    "luego te digo", "ya te dire", "ya te diré",
  ].some((k) => t.includes(normalize(k)));
}

export const SNOOZE_ASK =
  "No pasa nada 😊\n¿Prefieres que volvamos a hablar?\n1️⃣ Mañana\n2️⃣ La semana que viene";

export const SNOOZE_CONFIRM = (cuando: string) =>
  `¡Perfecto! Te escribo ${cuando}. ¡Que vaya genial! 💪`;

export const SNOOZE_NUDGE = (nombre: string) =>
  `¡Hola${nombre ? ` ${nombre}` : ""}! 😊 Como me pediste, retomamos.\n` +
  "¿Reservamos tu hueco?\n1️⃣ Ver horarios disponibles\n2️⃣ Ahora no";

export const KIND_LABEL: Record<string, string> = {
  valoracion_video:   "tu valoración gratuita por videollamada",
  valoracion_llamada: "tu valoración gratuita por teléfono",
  clase_prueba:       "tu clase de prueba",
};
