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

// ════════════════════════════════════════════════════════════════════════════
// RECEPCIONISTA DE DOBLE NEGOCIO (Love Fitness presencial · Transforma online)
// Un único WhatsApp atiende ambos; el asistente detecta el negocio y NUNCA
// mezcla respuestas. context "gym" = presencial, "online" = Transforma.
// ════════════════════════════════════════════════════════════════════════════

export type BusinessContext = "gym" | "online";

/** Enlaces oficiales de cierre — uno por negocio, nunca cruzados. */
export const LINKS = {
  gym:    "https://www.lovefitness.es",
  online: "https://www.transformacuerpo.com",
} as const;

// Señales específicas de cada negocio (por límite de palabra). Los términos
// genéricos (hola, información, precio, me interesa, apuntarme) NO van aquí:
// sin negocio claro se muestra el saludo del recepcionista.
const GYM_SIGNALS = [
  "gimnasio", "gym", "murcia", "presencial", "entrenamiento presencial",
  "clase", "clases", "pesas", "monitor", "sala", "instalaciones",
  "horario", "horarios", "clase de prueba", "grupal", "funcional",
  "personal trainer", "entrenador personal",
];

const ONLINE_SIGNALS = [
  "online", "app", "aplicacion", "aplicación", "coach", "seguimiento",
  "nutricion", "nutrición", "transforma", "plan online", "planes online",
  "entrenamiento online", "entrenador online", "reto", "suscripcion", "suscripción",
];

/** Detecta el negocio por señales específicas. null = ambiguo → recepción. */
export function classifyBusiness(text: string): BusinessContext | null {
  const t = normalize(text);
  const gym    = GYM_SIGNALS.some((k) => matchesKeyword(t, k));
  const online = ONLINE_SIGNALS.some((k) => matchesKeyword(t, k));
  if (gym && !online) return "gym";
  if (online && !gym) return "online";
  return null; // ambos o ninguno → preguntar
}

/** ¿El mensaje contiene señales FUERTES del otro negocio? (cambio de contexto) */
export function mentionsOtherBusiness(text: string, current: BusinessContext): boolean {
  const t = normalize(text);
  const other = current === "gym" ? ONLINE_SIGNALS : GYM_SIGNALS;
  // Solo señales inequívocas para no cambiar de contexto por error
  const strong = current === "gym"
    ? ["online", "app", "coach", "transforma", "nutricion", "nutrición", "suscripcion", "suscripción", "entrenamiento online"]
    : ["gimnasio", "presencial", "murcia", "clase de prueba", "instalaciones", "sala"];
  return strong.some((k) => matchesKeyword(t, k)) && other.some((k) => matchesKeyword(t, k));
}

/**
 * Intención CLARA de compra/contratación (para enviar el enlace).
 * Solo pedir información NO cuenta — el enlace se envía únicamente aquí.
 */
export function detectPurchaseIntent(text: string): boolean {
  const t = normalize(text);
  return [
    "quiero apuntarme", "apuntarme", "quiero inscribirme", "inscribirme",
    "como me inscribo", "cómo me inscribo", "quiero empezar", "quiero reservar plaza",
    "quiero contratar", "contratar", "quiero suscribirme", "suscribirme",
    "como pago", "cómo pago", "quiero pagar", "darme de alta",
  ].some((k) => matchesKeyword(t, k));
}

/** Intención de clase de prueba (gimnasio): probar / clase de prueba. */
export function detectTrialIntent(text: string): boolean {
  const t = normalize(text);
  return matchesKeyword(t, "clase de prueba") || matchesKeyword(t, "probar") ||
         matchesKeyword(t, "prueba gratis") || matchesKeyword(t, "quiero probar");
}

/** Intención de valoración (online): valoración / valorar. */
export function detectValoracionIntent(text: string): boolean {
  const t = normalize(text);
  return matchesKeyword(t, "valoracion") || matchesKeyword(t, "valoración") || matchesKeyword(t, "valorar");
}

/** Afirmación breve: sí / vale / ok / claro / perfecto / me interesa. */
export function detectYes(text: string): boolean {
  const t = normalize(text);
  return ["si", "sí", "vale", "ok", "okey", "claro", "perfecto", "genial",
          "me interesa", "por supuesto", "adelante", "venga", "dale"].some((k) => matchesKeyword(t, k));
}

// ─── Copys del recepcionista ─────────────────────────────────────────────────

export const RECEPTION_GREETING =
  "👋 ¡Hola! Soy el asistente virtual de Love Fitness Murcia y Transforma Fit Coach.\n\n" +
  "Estoy aquí para ayudarte a elegir la mejor opción según tus objetivos.\n\n" +
  "¿Buscas información sobre:\n\n" +
  "1️⃣ Nuestro gimnasio presencial en Murcia.\n\n" +
  "2️⃣ Nuestros programas de entrenamiento online.";

export const AMBIGUITY_ASK =
  "¿Buscas información sobre el gimnasio presencial o sobre nuestros programas online?\n" +
  "1️⃣ Gimnasio presencial\n2️⃣ Programas online";

// ── LOVE FITNESS (gym) ──
export const GYM_MENU =
  "💪 ¡Genial! Te cuento sobre nuestro gimnasio en Murcia.\n\n" +
  "¿Qué te gustaría saber?\n\n" +
  "1️⃣ Entrenamiento grupal\n2️⃣ Entrenamiento funcional\n" +
  "3️⃣ Personal Trainer\n4️⃣ Horarios e instalaciones\n5️⃣ Reservar clase de prueba";

export const GYM_PLAN_DETAILS: Record<number, string> = {
  1: "💪 *Entrenamiento grupal — 59€/mes*\nEntrenamientos de lunes a viernes.\nIncluye Open Box 24 h los 365 días.",
  2: "🏃 *Entrenamiento funcional — 39,99€/mes*\n3 días por semana, guiados desde la App.\nNo incluye Open Box.",
  3: "🎯 *Personal Trainer — desde 180€/mes*\n3 sesiones/semana + dieta + Tesla Slimming.\n⭐ Premium 250€/mes: 5 sesiones + horario flexible.",
};

export const GYM_AFTER_PLAN =
  "¿Te gustaría venir a conocerlo?\n" +
  "1️⃣ Reservar una clase de prueba\n2️⃣ Ver otro plan";

export const GYM_TRIAL_PITCH =
  "La clase de prueba tiene un coste de 10 €.\n\n" +
  "Puedes realizarla en cualquier horario donde haya un monitor disponible.\n\n" +
  "Indícanos qué día y qué franja horaria prefieres y te confirmaremos la disponibilidad.";

export const GYM_TRIAL_CAPTURED = (nombre: string) =>
  `¡Perfecto${nombre ? `, ${nombre}` : ""}! 😊 Tomo nota de tu preferencia.\n` +
  "Un monitor te confirma enseguida la disponibilidad de tu clase de prueba. 💪";

export const GYM_CLOSE =
  "¡Genial! 😊\n\n" +
  "Será un placer ayudarte a conseguir tus objetivos.\n\n" +
  "Puedes realizar tu inscripción directamente aquí:\n\n" +
  `${LINKS.gym}\n\n` +
  "Si antes quieres que te ayude a elegir el plan más adecuado según tus objetivos, estaré encantado de ayudarte.";

// ── TRANSFORMA FIT COACH (online) ──
export const ONLINE_INFO =
  "💻 En *Transforma Fit Coach* entrenas donde quieras con:\n\n" +
  "• App con tus rutinas y seguimiento\n" +
  "• Plan de nutrición personalizado\n" +
  "• Un coach que ajusta tu progreso\n\n" +
  "¿Qué prefieres?\n1️⃣ Reservar una valoración gratuita\n2️⃣ Que te recomiende el plan ideal";

export const ONLINE_CLOSE =
  "¡Perfecto! 💪\n\n" +
  "Puedes contratar tu plan directamente desde:\n\n" +
  `${LINKS.online}\n\n` +
  "Si ya tienes instalada la aplicación también podrás hacerlo desde el apartado Suscripciones.\n\n" +
  "Si todavía no sabes qué plan elegir, dime cuál es tu objetivo y te recomendaré el más adecuado.";

// ── Asesor IA por objetivo (ambos negocios, determinista) ──
export const OBJECTIVE_QUESTION =
  "Para recomendarte lo mejor, ¿cuál es tu principal objetivo?\n" +
  "1️⃣ Perder grasa\n2️⃣ Ganar masa muscular\n3️⃣ Mejorar tu salud\n" +
  "4️⃣ Ponerte en forma\n5️⃣ Preparar una competición";

const OBJECTIVE_LABEL: Record<number, string> = {
  1: "perder grasa", 2: "ganar masa muscular", 3: "mejorar tu salud",
  4: "ponerte en forma", 5: "preparar una competición",
};

export function recommendPlan(context: BusinessContext, objective: number): string {
  const obj = OBJECTIVE_LABEL[objective] ?? "tu objetivo";
  if (context === "gym") {
    const rec =
      objective === 1 ? "el *Personal Trainer* (dieta + Tesla Slimming) para maximizar la pérdida de grasa"
      : objective === 2 ? "el *Personal Trainer* con seguimiento de fuerza y dieta"
      : objective === 3 ? "el *entrenamiento grupal* (59€), completo y motivador"
      : objective === 4 ? "el *funcional* (39,99€) o el *grupal* (59€)"
      : "el *Personal Trainer Premium*, con plan y seguimiento total";
    return `Para ${obj} te recomiendo ${rec}.\n\n` +
      "¿Quieres reservar una clase de prueba para verlo en persona?\n1️⃣ Sí, reservar\n2️⃣ Prefiero apuntarme ya";
  }
  const rec =
    objective === 1 ? "un plan online con déficit guiado y nutrición ajustada"
    : objective === 2 ? "un plan de hipertrofia con seguimiento del coach"
    : objective === 3 ? "un plan de salud y hábitos con la App"
    : objective === 4 ? "un plan de puesta en forma progresivo"
    : "un plan de preparación específico con seguimiento total";
  return `Para ${obj} te recomiendo ${rec}.\n\n` +
    "¿Reservamos una valoración gratuita para diseñarlo contigo?\n1️⃣ Sí, reservar\n2️⃣ Quiero contratar ya";
}

// ── Cambio de contexto ──
export const SWITCH_OFFER = (from: BusinessContext) =>
  from === "gym"
    ? "Además del gimnasio también disponemos de programas completamente online.\n\n" +
      "¿Quieres que te explique cómo funcionan?\n1️⃣ Sí\n2️⃣ No, seguimos con el gimnasio"
    : "Además de los programas online, también tenemos nuestro gimnasio presencial en Murcia.\n\n" +
      "¿Quieres que te cuente?\n1️⃣ Sí\n2️⃣ No, seguimos con lo online";
