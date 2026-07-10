// Contract tests del módulo Instagram — congelan las estructuras de las que
// dependen el webhook (Vercel) y los procesadores (worker): nombres de cola,
// forma de los jobs y campos idempotentes. Herméticos (sin BD ni red).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { QUEUE_NAMES } from "../../lib/queue/types";

// ─── Nombres de cola IG estables (el worker congelado depende de ellos) ──────
test("QUEUE_NAMES de Instagram no cambian", () => {
  assert.equal(QUEUE_NAMES.IGM_MESSAGE,  "igm-message");
  assert.equal(QUEUE_NAMES.IGM_OUTBOUND, "igm-outbound");
  assert.equal(QUEUE_NAMES.IGM_COMMENT,  "igm-comment");
  assert.equal(QUEUE_NAMES.IGM_MEDIA,    "igm-media");
  assert.equal(QUEUE_NAMES.IGM_TOKEN,    "igm-token");
});

// ─── Idempotencia: el webhook usa mid (mensaje) y commentId (comentario) ─────
test("el webhook IG extrae la clave idempotente correcta", () => {
  const src = readFileSync("pages/api/webhook/instagram.ts", "utf8");
  assert.match(src, /mid:\s+msg\.message\.mid/, "el job de DM debe llevar mid (idempotencia)");
  assert.match(src, /commentId:\s+v\.id/,       "el job de comentario debe llevar commentId (idempotencia)");
  assert.match(src, /isEcho:\s+msg\.message\.is_echo\s+===\s+true/, "el webhook marca isEcho");
});

// ─── El procesador de DM salta ecos y deduplica ──────────────────────────────
test("instagram-message.processor salta ecos e idempotencia por mid", () => {
  const src = readFileSync("workers/processors/instagram-message.processor.ts", "utf8");
  assert.match(src, /if\s*\(job\.isEcho\)/, "debe saltar ecos");
  assert.match(src, /checkAndRecordEvent|idempoten/i, "debe deduplicar por mid");
});

// ─── El procesador de comentarios es idempotente por commentId ───────────────
test("instagram-comment.processor es idempotente por commentId", () => {
  const src = readFileSync("workers/processors/instagram-comment.processor.ts", "utf8");
  assert.match(src, /instagram_webhook_events/, "usa la tabla de idempotencia");
  assert.match(src, /event_id:\s+job\.commentId/, "clave idempotente = commentId");
});

// ─── El webhook IG vive en Pages Router (bytes crudos para la firma) ─────────
test("el webhook IG usa bodyParser:false (fidelidad de bytes para HMAC)", () => {
  const src = readFileSync("pages/api/webhook/instagram.ts", "utf8");
  assert.match(src, /bodyParser:\s*false/);
  assert.match(src, /x-hub-signature-256/);
});

// ─── La lógica pura y los procesadores comparten el mismo criterio de guarda ──
test("la lógica pura expone los guardas exigidos", async () => {
  const m = await import("../../lib/instagram/reply-logic");
  // self-comment, already-replied, stale, echo, duplicate
  assert.equal(m.shouldReplyToComment("x", { fromIgUserId: "A", accountIgUserId: "A", timestampMs: Date.now() }).process, false);
  assert.equal(m.shouldReplyToDM("x", { isEcho: true }).process, false);
  assert.equal(typeof m.classifyIntent, "function");
  assert.equal(typeof m.commentReply, "function");
  assert.equal(typeof m.dmReply, "function");
});
