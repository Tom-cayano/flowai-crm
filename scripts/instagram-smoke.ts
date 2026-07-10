// Smoke test del módulo Instagram.
//
// Verifica la parte de la cadena que corre en Vercel (el webhook) y reporta con
// honestidad la SALUD de las cuentas/tokens (que corre en Meta). No inventa un
// "todo OK": si los tokens están caducados lo dice de forma prominente, porque
// sin token válido Instagram no puede enviar ni recibir.
//
// Uso: npm run smoke:instagram   (requiere .env.production con credenciales)

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.production", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)="?([^"]*)"?$/);
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/\\n$/, "");
}

const BASE  = process.env.SMOKE_BASE ?? "https://www.flowaicrm.com";
const TOKEN = (process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? "").trim();

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { persistSession: false },
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    realtime: typeof globalThis.WebSocket === "undefined" ? { transport: require("ws") } : {},
  },
);

function fail(msg: string): never { console.error(`❌ SMOKE IG FAIL: ${msg}`); process.exit(1); }

async function main() {
  // 1. Webhook GET verification (handshake de Meta) — parte viva en Vercel.
  if (TOKEN) {
    const challenge = `smoke-${Date.now()}`;
    const url = `${BASE}/api/webhook/instagram?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(TOKEN)}&hub.challenge=${challenge}`;
    const res  = await fetch(url);
    const body = await res.text();
    if (res.status !== 200 || body !== challenge) {
      fail(`webhook verify handshake inesperado (HTTP ${res.status}, body="${body.slice(0, 40)}")`);
    }
    console.log("✓ webhook IG vivo (handshake de verificación correcto)");
  } else {
    // Sin token de verificación local: al menos comprobar que la ruta responde.
    const res = await fetch(`${BASE}/api/webhook/instagram?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x`);
    if (res.status !== 403) fail(`webhook IG no rechaza token inválido (HTTP ${res.status})`);
    console.log("✓ webhook IG vivo (rechaza verify_token inválido con 403)");
  }

  // 2. Salud de cuentas / tokens (corre en Meta) — reporte honesto.
  const { data: accounts, error } = await db
    .from("instagram_accounts")
    .select("ig_user_id, ig_username, is_active, connection_state, token_expires_at")
    .eq("is_active", true);
  if (error) fail(`no se pudo leer instagram_accounts: ${error.message}`);

  if (!accounts?.length) {
    console.log("⚠️  No hay cuentas de Instagram activas.");
    console.log("\n✅ SMOKE IG OK (webhook) — sin cuentas que verificar.");
    return;
  }

  const expired = accounts.filter((a) => a.connection_state !== "connected");
  for (const a of accounts) {
    const flag = a.connection_state === "connected" ? "🟢" : "🔴";
    console.log(`${flag} @${a.ig_username ?? a.ig_user_id} — estado=${a.connection_state} expira=${a.token_expires_at ?? "—"}`);
  }

  if (expired.length) {
    console.log("\n⚠️  BLOQUEANTE: hay cuentas con el token caducado/desconectado.");
    console.log("    Instagram no puede enviar ni recibir hasta reconectar la cuenta.");
    console.log(`    Acción: entra en ${BASE}/settings/instagram y reconecta por OAuth de Meta.`);
    console.log("\n✅ SMOKE IG OK (webhook vivo) — ⚠️ tokens pendientes de renovar por el usuario.");
    return;
  }

  console.log("\n✅ SMOKE IG OK — webhook vivo y cuentas conectadas.");
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
