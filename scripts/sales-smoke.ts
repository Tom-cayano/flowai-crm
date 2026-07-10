// FASE 6 — Smoke test post-deploy del recepcionista.
//
// Verifica la cadena real de producción tras cada deploy:
//   endpoint puente vivo → crea contacto de prueba → POST /api/sales/run →
//   el asistente ejecuta y responde (encola en wpp-outbound) → limpieza.
//
// Si CUALQUIER paso falla → exit 1 (para cancelar/avisar del despliegue).
// Usa un teléfono ficticio (no molesta a nadie); valida hasta "asistente
// respondió". Para validar entrega real por WhatsApp, usar VERIFY_PHONE con un
// número propio.
//
// Uso: npm run smoke:sales   (requiere .env.production con EVOLUTION_WEBHOOK_SECRET,
//      NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY)

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.production", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)="?([^"]*)"?$/);
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/\\n$/, "");
}

const BASE   = process.env.SMOKE_BASE ?? "https://www.flowaicrm.com";
const SECRET = (process.env.EVOLUTION_WEBHOOK_SECRET ?? "").replace(/\\n$/, "");
const PHONE  = process.env.VERIFY_PHONE ?? "34600000166";
const USER   = "2da9c9b6-2efe-4137-a94a-dea999cb404d";

function fail(msg: string): never { console.error(`❌ SMOKE FAIL: ${msg}`); process.exit(1); }

async function main() {
  if (!SECRET) fail("EVOLUTION_WEBHOOK_SECRET ausente");
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
      // Node.js 20 no trae WebSocket nativo; supabase-js lo exige al construir
      // el cliente realtime. Node 22+ ya lo trae y no necesita el transport.
      realtime: typeof globalThis.WebSocket === "undefined"
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        ? { transport: require("ws") }
        : {},
    },
  );

  // 1. Endpoint puente vivo
  const alive = await fetch(`${BASE}/api/sales/run`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
  if (alive.status !== 401 && alive.status !== 200) fail(`/api/sales/run inesperado HTTP ${alive.status} (deploy incompleto)`);
  console.log(`✓ puente vivo (HTTP ${alive.status})`);

  // 2. Contacto + conversación de prueba
  await db.from("contacts").delete().eq("phone", PHONE);
  const { data: c, error: ce } = await db.from("contacts")
    .insert({ user_id: USER, name: "SMOKE", phone: PHONE, whatsapp: PHONE, status: "active", tags: [], custom_fields: {} })
    .select("id").single();
  if (ce || !c) fail(`no se pudo crear contacto de prueba: ${ce?.message}`);
  const { data: cv } = await db.from("contacts").select("id").eq("id", c.id).single();
  await db.from("conversations").insert({ user_id: USER, contact_id: c.id, contact_name: "SMOKE", contact_phone: PHONE, status: "open", channel: "whatsapp", tags: [], unread_count: 0 });
  void cv;

  try {
    // 3. Ejecutar el asistente vía el puente con "Hola" → debe saludar (recepción)
    const run = await fetch(`${BASE}/api/sales/run?user=${USER}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-sales-secret": SECRET },
      body: JSON.stringify({ phone: PHONE, text: "Hola" }),
    });
    const body = await run.json().catch(() => null) as { ok?: boolean; handled?: boolean; detail?: string } | null;
    if (!run.ok || !body?.ok || !body.handled) fail(`el asistente no respondió: HTTP ${run.status} ${JSON.stringify(body)}`);
    if (body.detail !== "reception:saludo") fail(`respuesta inesperada al saludo: ${body.detail}`);
    console.log(`✓ asistente respondió al saludo (detail=${body.detail})`);
  } finally {
    // 4. Limpieza
    const { data: convs } = await db.from("conversations").select("id").eq("contact_id", c.id);
    for (const conv of convs ?? []) await db.from("messages").delete().eq("conversation_id", conv.id);
    await db.from("conversations").delete().eq("contact_id", c.id);
    await db.from("contacts").delete().eq("id", c.id);
  }

  console.log("\n✅ SMOKE OK — webhook/puente/asistente operativos tras el deploy.");
}
main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
