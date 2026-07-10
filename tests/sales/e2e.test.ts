// FASE 4 — Tests E2E de la máquina de estados (casos de usuario reales).
// Ejecuta runSalesAssistant contra la BD real con un contacto de prueba
// controlado, INYECTANDO el puerto de salida (deps.send) para capturar las
// respuestas sin depender de la cola compartida (determinista, sin carrera).
//
// Requiere SUPABASE_SERVICE_ROLE_KEY. Sin credenciales, se SALTA (CI hermético).
// En local con credenciales: npm run test:e2e

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

try {
  const env = readFileSync(".env.production", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_0-9]+)="?([^"]*)"?$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/\\n$/, "");
  }
} catch { /* usar env del entorno */ }

const HAS_CREDS = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
const opts = HAS_CREDS ? {} : { skip: "sin credenciales (CI hermético) — usar npm run test:e2e en local" };

const USER  = "2da9c9b6-2efe-4137-a94a-dea999cb404d";
const PHONE = "34600000177";
let CID = "", CVID = "";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const captured: string[] = [];
const send = async (p: { content: string }) => { captured.push(p.content); };

before(async () => {
  if (!HAS_CREDS) return;
  const { createAdminClient } = await import("../../lib/supabase/admin");
  db = createAdminClient();
  await db.from("contacts").delete().eq("phone", PHONE);
  const { data: c } = await db.from("contacts").insert({
    user_id: USER, name: "E2E TEST", phone: PHONE, whatsapp: PHONE, status: "active", tags: [], custom_fields: {},
  }).select("id").single();
  CID = c.id;
  const { data: cv } = await db.from("conversations").insert({
    user_id: USER, contact_id: CID, contact_name: "E2E TEST", contact_phone: PHONE,
    status: "open", channel: "whatsapp", tags: [], unread_count: 0,
  }).select("id").single();
  CVID = cv.id;
});

after(async () => {
  if (!HAS_CREDS || !CID) return;
  await db.from("messages").delete().eq("conversation_id", CVID);
  await db.from("appointments").delete().eq("contact_id", CID);
  await db.from("conversations").delete().eq("id", CVID);
  await db.from("contacts").delete().eq("id", CID);
});

async function say(text: string): Promise<{ out: string; state: unknown; ctx: unknown }> {
  captured.length = 0;
  const { runSalesAssistant } = await import("../../lib/sales/assistant");
  await runSalesAssistant({
    userId: USER, conversationId: CVID, contactId: CID, phone: PHONE, incomingText: text,
    isFirstMessage: false, instanceName: "flowai", serverUrl: process.env.EVOLUTION_SERVER_URL ?? "x",
    instanceApiKey: process.env.EVOLUTION_API_KEY ?? "k", variables: {}, triggerType: "message_received",
    executionId: "", automationId: "test",
  }, async () => {}, { send });
  const { data } = await db.from("contacts").select("custom_fields").eq("id", CID).maybeSingle();
  const cf = (data?.custom_fields ?? {}) as Record<string, unknown>;
  return { out: captured.join(" ⏎ "), state: cf.funnel_state, ctx: cf.funnel_context };
}
const reset = () => db.from("contacts").update({ custom_fields: {}, tags: [] }).eq("id", CID);

test("E2E CASO 1 · gimnasio hasta el enlace de inscripción (lovefitness.es)", opts, async () => {
  await reset();
  let r = await say("Hola");            assert.equal(r.state, "reception");
  r = await say("1");                   assert.equal(r.ctx, "gym");
  r = await say("precio");              assert.match(r.out, /59|39,99|grupal/i);
  r = await say("quiero apuntarme");    assert.ok(r.out.includes("https://www.lovefitness.es"));
  assert.ok(!r.out.includes("transformacuerpo"));
});

test("E2E CASO 2 · online hasta el enlace de contratación (transformacuerpo.com)", opts, async () => {
  await reset();
  await say("Hola");
  let r = await say("2");               assert.equal(r.ctx, "online");
  r = await say("quiero contratar");    assert.ok(r.out.includes("https://www.transformacuerpo.com"));
  assert.ok(!r.out.includes("lovefitness"));
});

test("E2E CASO 3 · clase de prueba 10€ con horario ABIERTO (nunca cerrado)", opts, async () => {
  await reset();
  const r = await say("quiero probar una clase");
  assert.match(r.out, /10 €/);
  assert.match(r.out, /qué día y qué franja/i);
  assert.ok(!/1️⃣ (lunes|martes|miércoles|jueves|viernes)/i.test(r.out));
});

test("E2E CASO 4 · valoración online mantiene horarios cerrados", opts, async () => {
  await reset();
  await say("me interesa el entrenamiento online");
  await say("1");
  const r = await say("1");
  assert.match(r.out, /horario prefieres|completa/i);
});

test("E2E CASO 5 · cambio de contexto → pregunta antes de cambiar", opts, async () => {
  await reset();
  await say("gimnasio");
  let r = await say("y teneis algo online con app?");
  assert.equal(r.state, "switch_offer");
  assert.match(r.out, /también disponemos de programas completamente online/i);
  r = await say("1");
  assert.equal(r.ctx, "online");
});
