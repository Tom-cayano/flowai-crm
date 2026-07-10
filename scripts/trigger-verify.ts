// Verificación del DISPARADOR del recepcionista comercial contra PRODUCCIÓN.
//
// Demuestra con evidencia real (respuestas del puente /api/sales/run) qué
// eventos ACTIVAN el asistente y cuáles quedan BLOQUEADOS. Crea contactos de
// prueba con teléfonos ficticios (no molesta a nadie), controla la frescura del
// mensaje entrante y limpia todo al final.
//
// Uso: npm run verify:trigger
//      (requiere .env.production con EVOLUTION_WEBHOOK_SECRET + credenciales Supabase)

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.production", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)="?([^"]*)"?$/);
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/\\n$/, "");
}

const BASE   = process.env.SMOKE_BASE ?? "https://www.flowaicrm.com";
const SECRET = (process.env.EVOLUTION_WEBHOOK_SECRET ?? "").replace(/\\n$/, "");
const USER   = "2da9c9b6-2efe-4137-a94a-dea999cb404d";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false },
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    realtime: typeof globalThis.WebSocket === "undefined" ? { transport: require("ws") } : {},
  },
);

let failures = 0;
const line = () => console.log("─".repeat(72));

async function makeContact(phone: string, opts: { tags?: string[]; source?: string; custom?: Record<string, unknown> } = {}) {
  await db.from("contacts").delete().eq("phone", phone);
  const { data: c } = await db.from("contacts").insert({
    user_id: USER, name: "TRIGGER TEST", phone, whatsapp: phone, status: "active",
    tags: opts.tags ?? [], source: opts.source ?? null, custom_fields: opts.custom ?? {},
  }).select("id").single();
  const { data: cv } = await db.from("conversations").insert({
    user_id: USER, contact_id: c!.id, contact_name: "TRIGGER TEST", contact_phone: phone,
    status: "open", channel: "whatsapp", tags: [], unread_count: 0,
  }).select("id").single();
  return { cid: c!.id as string, cvid: cv!.id as string };
}

async function inbound(cvid: string, content: string, ageMs = 0) {
  await db.from("messages").insert({
    conversation_id: cvid, content, type: "text", message_type: "text",
    sender: "contact", status: "received", external_id: `verify-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    created_at: new Date(Date.now() - ageMs).toISOString(),
  });
}

async function callBridge(phone: string) {
  const res = await fetch(`${BASE}/api/sales/run?user=${USER}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-sales-secret": SECRET },
    body: JSON.stringify({ phone }),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function cleanup(phone: string) {
  const { data: c } = await db.from("contacts").select("id").eq("phone", phone).maybeSingle();
  if (!c) return;
  const { data: cvs } = await db.from("conversations").select("id").eq("contact_id", c.id);
  for (const cv of cvs ?? []) await db.from("messages").delete().eq("conversation_id", cv.id);
  await db.from("conversations").delete().eq("contact_id", c.id);
  await db.from("contacts").delete().eq("id", c.id);
}

/** Ejecuta un escenario y comprueba la expectativa contra la respuesta real. */
function check(label: string, kind: "FIRE" | "BLOCK", got: Record<string, unknown>, ok: boolean) {
  const tag = kind === "FIRE" ? "✅ DISPARA" : "🚫 BLOQUEA";
  const verdict = ok ? "PASS" : "FAIL";
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} [${tag}] ${label}`);
  console.log(`    → ${JSON.stringify(got)}   [${verdict}]`);
}

async function main() {
  if (!SECRET) { console.error("❌ EVOLUTION_WEBHOOK_SECRET ausente"); process.exit(1); }
  line(); console.log("VERIFICACIÓN DEL DISPARADOR DEL SALES ASSISTANT — producción:", BASE); line();

  // ── 1. DISPARA: mensaje entrante NUEVO de WhatsApp (consulta gimnasio) ─────
  {
    const P = "34600000201"; const { cvid } = await makeContact(P);
    await inbound(cvid, "Hola, quiero información del gimnasio", 2_000);
    const r = await callBridge(P);
    check("nuevo mensaje entrante real (fromMe=false, reciente)", "FIRE", r.json,
      r.json.ok === true && r.json.handled === true);
    await cleanup(P);
  }

  // ── 2. DISPARA: lead nuevo de Transforma Fit Coach ────────────────────────
  {
    const P = "34600000202"; const { cvid } = await makeContact(P, { source: "transforma-fit-coach" });
    await inbound(cvid, "Hola", 2_000);
    const r = await callBridge(P);
    check("lead nuevo de Transforma Fit Coach", "FIRE", r.json,
      r.json.ok === true && r.json.handled === true && String(r.json.detail).startsWith("online"));
    await cleanup(P);
  }

  // ── 3. BLOQUEA: re-saludo (assistant_initialized ya es true) ───────────────
  {
    const P = "34600000203"; const { cvid } = await makeContact(P, { custom: { assistant_initialized: true } });
    await inbound(cvid, "Hola", 2_000);
    const r = await callBridge(P);
    check("contacto ya saludado → NO re-saluda", "BLOCK", r.json,
      r.json.ok === true && r.json.handled === false && r.json.detail === "welcome:bloqueado-ya-inicializado");
    await cleanup(P);
  }

  // ── 4. BLOQUEA: conversación antigua reabierta / historial sincronizado ────
  {
    const P = "34600000204"; const { cvid } = await makeContact(P);
    await inbound(cvid, "Hola", 3 * 3600_000); // último entrante hace 3 h
    const r = await callBridge(P);
    check("conversación antigua / sync de historial (mensaje viejo)", "BLOCK", r.json,
      r.json.blocked === "stale-inbound");
    await cleanup(P);
  }

  // ── 5. BLOQUEA: abrir/leer un chat (sin ningún mensaje entrante) ───────────
  {
    const P = "34600000205"; await makeContact(P); // conversación sin mensajes
    const r = await callBridge(P);
    check("abrir/leer chat sin mensaje entrante", "BLOCK", r.json,
      r.json.blocked === "no-inbound-message");
    await cleanup(P);
  }

  // ── 6. BLOQUEA: contacto de otra empresa (Renovamax) / proveedor / cliente ─
  {
    const P = "34600000206"; const { cvid } = await makeContact(P, { tags: ["renovamax"] });
    await inbound(cvid, "Hola, quiero información", 2_000);
    const r = await callBridge(P);
    check("contacto de otra empresa (Renovamax)", "BLOCK", r.json,
      r.json.ok === true && r.json.handled === false && r.json.detail === "excluido:renovamax");
    await cleanup(P);
  }

  line();
  if (failures === 0) {
    console.log("✅ TRIGGER OK — dispara sólo con entrantes reales; bloquea el resto.");
    process.exit(0);
  }
  console.error(`❌ TRIGGER FAIL — ${failures} escenario(s) no cumplieron la expectativa.`);
  process.exit(1);
}

main().catch((e) => { console.error("❌", e instanceof Error ? e.message : e); process.exit(1); });
