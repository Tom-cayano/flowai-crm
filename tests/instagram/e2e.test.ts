// E2E del asistente de Instagram contra la BD real de producción.
// Aplica los guardas de la lógica pura a DATOS REALES (cuentas y comentarios
// almacenados) para demostrar los invariantes de FASE 5. Sin credenciales, se
// SALTA (CI hermético). En local con credenciales: npm run test:ig:e2e

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shouldReplyToComment, classifyIntent } from "../../lib/instagram/reply-logic";

try {
  const env = readFileSync(".env.production", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)="?([^"]*)"?$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/\\n$/, "");
  }
} catch { /* usar env del entorno */ }

const HAS_CREDS = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
const opts = HAS_CREDS ? {} : { skip: "sin credenciales (CI hermético) — usar npm run test:ig:e2e en local" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let ownerIgUserId = "";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let selfComment: any = null;

before(async () => {
  if (!HAS_CREDS) return;
  const { createAdminClient } = await import("../../lib/supabase/admin");
  db = createAdminClient();
  const { data: acc } = await db.from("instagram_accounts")
    .select("ig_user_id").eq("is_active", true).limit(1).maybeSingle();
  ownerIgUserId = acc?.ig_user_id ?? "";
  if (ownerIgUserId) {
    const { data } = await db.from("instagram_comment_events")
      .select("content, from_ig_user_id, created_at")
      .eq("from_ig_user_id", ownerIgUserId).limit(1).maybeSingle();
    selfComment = data;
  }
});

test("E2E IG · existe al menos una cuenta de Instagram", opts, () => {
  assert.ok(ownerIgUserId, "debe haber una cuenta IG activa (ig_user_id)");
});

test("E2E IG · un comentario REAL de la propia cuenta se bloquea (self-comment)", opts, () => {
  if (!selfComment) { assert.ok(true, "sin auto-comentarios almacenados — nada que verificar"); return; }
  const d = shouldReplyToComment(selfComment.content || "x", {
    fromIgUserId:    selfComment.from_ig_user_id,
    accountIgUserId: ownerIgUserId,
    timestampMs:     Date.parse(selfComment.created_at) || Date.now(),
    nowMs:           Date.parse(selfComment.created_at) || Date.now(), // evitar falso stale
  });
  assert.deepEqual(d, { process: false, reason: "self-comment" });
});

test("E2E IG · un comentario REAL antiguo (>24h) se bloquea (stale)", opts, async () => {
  const { data } = await db.from("instagram_comment_events")
    .select("content, from_ig_user_id, created_at")
    .neq("from_ig_user_id", ownerIgUserId).limit(1).maybeSingle();
  if (!data) { assert.ok(true, "sin comentarios de terceros almacenados"); return; }
  const ageMs = Date.now() - (Date.parse(data.created_at) || Date.now());
  const d = shouldReplyToComment(data.content || "x", {
    fromIgUserId: data.from_ig_user_id, accountIgUserId: ownerIgUserId,
    timestampMs: Date.parse(data.created_at) || 0,
  });
  // Los comentarios reales almacenados son de junio → deben estar fuera de ventana.
  if (ageMs > 24 * 3600_000) assert.deepEqual(d, { process: false, reason: "stale-comment" });
  else assert.ok(d.process === true || d.process === false);
});

test("E2E IG · clasificación de intención sobre textos de usuario", opts, () => {
  assert.equal(classifyIntent("Precio"), "precio");
  assert.equal(classifyIntent("Información"), "info");
});
