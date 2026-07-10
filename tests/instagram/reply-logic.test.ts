// Tests unitarios de la lógica PURA del asistente de Instagram.
// Herméticos (sin BD ni red) — corren en CI. Cubren los invariantes de FASE 5.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalize,
  classifyIntent,
  shouldReplyToComment,
  shouldReplyToDM,
  commentReply,
  dmReply,
  DEFAULT_IG_COPY,
  INSTAGRAM_ASSISTANT_VERSION,
} from "../../lib/instagram/reply-logic";

const NOW = 1_800_000_000_000;

// ─── Normalización ──────────────────────────────────────────────────────────
test("normalize quita acentos, signos y colapsa espacios", () => {
  assert.equal(normalize("¡Información!  ¿PRECIO?"), "informacion precio");
  assert.equal(normalize("  Cuánto   cuesta  "), "cuanto cuesta");
});

// ─── Clasificación de intención (Precio / Información) ──────────────────────
test("clasifica PRECIO", () => {
  for (const t of ["precio", "¿Precio?", "cuánto cuesta", "qué coste tiene", "tarifas", "cuánto vale"]) {
    assert.equal(classifyIntent(t), "precio", `"${t}" debe ser precio`);
  }
});
test("clasifica INFORMACIÓN", () => {
  for (const t of ["info", "información", "más info", "quiero saber más", "me interesa", "cómo funciona"]) {
    assert.equal(classifyIntent(t), "info", `"${t}" debe ser info`);
  }
});
test("precio tiene prioridad sobre info", () => {
  assert.equal(classifyIntent("quiero info del precio"), "precio");
});
test("sin palabra clave → generic", () => {
  assert.equal(classifyIntent("hola buenas"), "generic");
  assert.equal(classifyIntent("😍🔥"), "generic");
});

// ─── Guarda de comentarios ──────────────────────────────────────────────────
test("NO responde a comentarios propios (self-comment)", () => {
  const d = shouldReplyToComment("precio", { fromIgUserId: "OWNER", accountIgUserId: "OWNER", timestampMs: NOW, nowMs: NOW });
  assert.deepEqual(d, { process: false, reason: "self-comment" });
});
test("NO responde dos veces (already-replied)", () => {
  const d = shouldReplyToComment("precio", { fromIgUserId: "U", accountIgUserId: "OWNER", timestampMs: NOW, nowMs: NOW, replyAlreadySent: true });
  assert.deepEqual(d, { process: false, reason: "already-replied" });
});
test("NO responde a comentarios antiguos (stale)", () => {
  const d = shouldReplyToComment("precio", { fromIgUserId: "U", accountIgUserId: "OWNER", timestampMs: NOW - 25 * 3600_000, nowMs: NOW });
  assert.deepEqual(d, { process: false, reason: "stale-comment" });
});
test("comentario vacío → no procesa", () => {
  assert.equal(shouldReplyToComment("   ", { fromIgUserId: "U", accountIgUserId: "OWNER", timestampMs: NOW, nowMs: NOW }).process, false);
});
test("comentario reciente de un tercero → procesa", () => {
  const d = shouldReplyToComment("precio", { fromIgUserId: "U", accountIgUserId: "OWNER", timestampMs: NOW - 60_000, nowMs: NOW });
  assert.deepEqual(d, { process: true });
});
test("ventana de frescura configurable", () => {
  const base = { fromIgUserId: "U", accountIgUserId: "OWNER", timestampMs: NOW - 2 * 3600_000, nowMs: NOW };
  assert.equal(shouldReplyToComment("precio", { ...base, maxAgeMs: 60 * 60_000 }).process, false);
  assert.equal(shouldReplyToComment("precio", { ...base, maxAgeMs: 3 * 3600_000 }).process, true);
});

// ─── Guarda de DMs ──────────────────────────────────────────────────────────
test("NO responde a ecos propios (echo)", () => {
  assert.deepEqual(shouldReplyToDM("hola", { isEcho: true }), { process: false, reason: "echo" });
});
test("NO responde a mid duplicado", () => {
  assert.deepEqual(shouldReplyToDM("hola", { isEcho: false, alreadySeenMid: true }), { process: false, reason: "duplicate" });
});
test("DM entrante nuevo → procesa", () => {
  assert.deepEqual(shouldReplyToDM("hola", { isEcho: false }), { process: true });
});

// ─── Respuestas por intención ───────────────────────────────────────────────
test("respuesta de comentario según intención", () => {
  assert.equal(commentReply("precio"), DEFAULT_IG_COPY.commentPrecio);
  assert.equal(commentReply("info"),   DEFAULT_IG_COPY.commentInfo);
  assert.equal(commentReply("generic"), DEFAULT_IG_COPY.commentGeneric);
});
test("respuesta de DM según intención", () => {
  assert.equal(dmReply("precio"), DEFAULT_IG_COPY.dmPrecio);
  assert.equal(dmReply("info"),   DEFAULT_IG_COPY.dmInfo);
  assert.equal(dmReply("generic"), DEFAULT_IG_COPY.dmGeneric);
});
test("copys editables (override)", () => {
  const cfg = { ...DEFAULT_IG_COPY, commentPrecio: "X" };
  assert.equal(commentReply("precio", cfg), "X");
});

// ─── Versión ────────────────────────────────────────────────────────────────
test("expone la versión estable", () => {
  assert.equal(INSTAGRAM_ASSISTANT_VERSION, "instagram_assistant_v1");
});
