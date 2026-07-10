// FASE 3 — Tests unitarios del router y la lógica pura del recepcionista.
// Herméticos (sin BD/Redis/red): protegen las decisiones de negocio.
// Ejecutar: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyBusiness,
  mentionsOtherBusiness,
  detectPurchaseIntent,
  detectSnooze,
  detectYes,
  parseNumericChoice,
  recommendPlan,
  LINKS,
  RECEPTION_GREETING,
  GYM_MENU,
  GYM_CLOSE,
  GYM_TRIAL_PITCH,
  ONLINE_INFO,
  ONLINE_CLOSE,
} from "../../lib/sales/knowledge";

// ─── Router inteligente: detección de negocio ─────────────────────────────────

test("router · detecta GIMNASIO por señales presenciales", () => {
  for (const t of ["info del gimnasio", "teneis sala de pesas?", "quiero una clase de prueba",
                   "hay monitor a esa hora?", "el gym de murcia", "entrenamiento presencial"]) {
    assert.equal(classifyBusiness(t), "gym", `"${t}" debería ser gym`);
  }
});

test("router · detecta ONLINE por señales de Transforma", () => {
  for (const t of ["me interesa el entrenamiento online", "como va la app?", "quiero coach y nutricion",
                   "info de transforma", "hacéis seguimiento online?", "el reto online"]) {
    assert.equal(classifyBusiness(t), "online", `"${t}" debería ser online`);
  }
});

test("router · términos genéricos son AMBIGUOS (→ recepción)", () => {
  for (const t of ["hola", "buenas", "informacion", "precio", "me interesa", "quiero apuntarme"]) {
    assert.equal(classifyBusiness(t), null, `"${t}" debería ser ambiguo`);
  }
});

test("router · señales de ambos negocios → ambiguo (no elige)", () => {
  assert.equal(classifyBusiness("quiero gimnasio y tambien online"), null);
});

test("router · no confunde subcadenas (whatsapp≠app, gimnasia≠gym)", () => {
  assert.equal(classifyBusiness("te escribo por whatsapp"), null);
});

// ─── Cambio de contexto ───────────────────────────────────────────────────────

test("cambio de contexto · en GYM detecta pregunta ONLINE", () => {
  assert.equal(mentionsOtherBusiness("y teneis algo online con app?", "gym"), true);
  assert.equal(mentionsOtherBusiness("y el horario del gimnasio?", "gym"), false);
});

test("cambio de contexto · en ONLINE detecta pregunta GYM", () => {
  assert.equal(mentionsOtherBusiness("teneis gimnasio presencial en murcia?", "online"), true);
  assert.equal(mentionsOtherBusiness("como funciona la app?", "online"), false);
});

// ─── Intención de compra (envío de enlace) ────────────────────────────────────

test("compra · SOLO intención clara dispara el enlace", () => {
  for (const t of ["quiero apuntarme", "quiero contratar", "como pago?", "quiero suscribirme", "quiero inscribirme"]) {
    assert.equal(detectPurchaseIntent(t), true, `"${t}" es compra`);
  }
  for (const t of ["cuanto cuesta?", "que horarios teneis", "informacion", "me lo pienso"]) {
    assert.equal(detectPurchaseIntent(t), false, `"${t}" NO es compra`);
  }
});

// ─── Enlaces correctos y NUNCA cruzados (invariante crítico FASE 13) ──────────

test("enlaces · Love Fitness y Transforma son los oficiales", () => {
  assert.equal(LINKS.gym, "https://www.lovefitness.es");
  assert.equal(LINKS.online, "https://www.transformacuerpo.com");
});

test("enlaces · cierre GYM contiene lovefitness y NO transformacuerpo", () => {
  assert.ok(GYM_CLOSE.includes("https://www.lovefitness.es"));
  assert.ok(!GYM_CLOSE.includes("transformacuerpo"));
});

test("enlaces · cierre ONLINE contiene transformacuerpo y NO lovefitness", () => {
  assert.ok(ONLINE_CLOSE.includes("https://www.transformacuerpo.com"));
  assert.ok(!ONLINE_CLOSE.includes("lovefitness"));
});

// ─── Nunca mezclar negocios en los copys ──────────────────────────────────────

test("no-mezcla · el menú de GYM no menciona Transforma/online", () => {
  assert.ok(!/transforma|transformacuerpo/i.test(GYM_MENU));
});

test("no-mezcla · la info ONLINE no menciona el gimnasio de Murcia", () => {
  assert.ok(!/gimnasio en murcia|lovefitness/i.test(ONLINE_INFO));
});

// ─── Clase de prueba: horario ABIERTO (sin huecos cerrados) ───────────────────

test("clase de prueba · pitch pide día/franja y NO ofrece horarios cerrados", () => {
  assert.ok(GYM_TRIAL_PITCH.includes("10 €"));
  assert.ok(/qué día y qué franja/i.test(GYM_TRIAL_PITCH));
  assert.ok(!/1️⃣ .*:00/.test(GYM_TRIAL_PITCH)); // no lista horas concretas numeradas
});

// ─── Parser de opciones ───────────────────────────────────────────────────────

test("parser · números, emojis y palabras", () => {
  assert.equal(parseNumericChoice("1", 2), 1);
  assert.equal(parseNumericChoice("2️⃣", 2), 2);
  assert.equal(parseNumericChoice("la 3", 4), 3);
  assert.equal(parseNumericChoice("opción 2", 4), 2);
  assert.equal(parseNumericChoice("uno", 2), 1);
  assert.equal(parseNumericChoice("el martes", 4), null);
  assert.equal(parseNumericChoice("9", 4), null); // fuera de rango
});

// ─── Asesor por objetivo (generación determinista de respuesta) ───────────────

test("asesor · GYM recomienda plan presencial y ofrece clase de prueba", () => {
  const r = recommendPlan("gym", 2); // ganar masa
  assert.ok(/ganar masa muscular/i.test(r));
  assert.ok(/clase de prueba/i.test(r));
  assert.ok(!/transformacuerpo/i.test(r));
});

test("asesor · ONLINE recomienda plan online y ofrece valoración", () => {
  const r = recommendPlan("online", 1); // perder grasa
  assert.ok(/perder grasa/i.test(r));
  assert.ok(/valoración/i.test(r));
  assert.ok(!/lovefitness/i.test(r));
});

// ─── Recuperación de leads ────────────────────────────────────────────────────

test("snooze · detecta 'ahora no puedo / más adelante'", () => {
  assert.equal(detectSnooze("ahora no puedo"), true);
  assert.equal(detectSnooze("mejor más adelante"), true);
  assert.equal(detectSnooze("vale, cuéntame"), false);
});

test("afirmación · detectYes reconoce sí/vale/ok/claro", () => {
  assert.equal(detectYes("sí, claro"), true);
  assert.equal(detectYes("vale"), true);
  assert.equal(detectYes("no gracias"), false);
});

// ─── Saludo del recepcionista ─────────────────────────────────────────────────

test("recepción · el saludo ofrece elegir gimnasio (1) u online (2)", () => {
  assert.ok(/asistente virtual de Love Fitness Murcia y Transforma/i.test(RECEPTION_GREETING));
  assert.ok(RECEPTION_GREETING.includes("1️⃣"));
  assert.ok(RECEPTION_GREETING.includes("2️⃣"));
});
