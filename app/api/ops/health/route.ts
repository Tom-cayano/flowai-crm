// GET /api/ops/health
//
// System health dashboard. Returns a structured JSON object describing
// the status of every critical subsystem.
//
// Response shape:
//   { ok: boolean, ts: string, checks: Record<string, CheckResult> }
//   HTTP 200 when all checks pass, HTTP 503 when any check fails.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic     = "force-dynamic";
export const runtime     = "nodejs";
export const maxDuration = 15;

interface CheckResult {
  ok:         boolean;
  latencyMs?: number;
  detail?:    string;
  error?:     string;
}

async function withTimeout<T>(ms: number, fn: () => Promise<T>): Promise<T | { timedOut: true }> {
  return Promise.race([
    fn(),
    new Promise<{ timedOut: true }>((r) => setTimeout(() => r({ timedOut: true }), ms)),
  ]);
}

// ── Supabase ──────────────────────────────────────────────────────────────────
async function checkSupabase(): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    const r = await withTimeout(5_000, async () =>
      createAdminClient().from("whatsapp_instances").select("id").limit(1)
    );
    if ("timedOut" in r) return { ok: false, error: "Supabase timed out after 5 s" };
    const latencyMs = Date.now() - t0;
    if (r.error)         return { ok: false, latencyMs, error: r.error.message };
    return { ok: true, latencyMs, detail: "whatsapp_instances readable" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Redis ─────────────────────────────────────────────────────────────────────
async function checkRedis(): Promise<CheckResult> {
  const t0  = Date.now();
  const url = process.env.REDIS_URL;
  if (!url) return { ok: false, error: "REDIS_URL not set" };
  try {
    const { Redis } = await import("ioredis");
    const redis = new Redis(url, { maxRetriesPerRequest: 0, connectTimeout: 3_000, lazyConnect: true });
    let pongResult = "";
    await withTimeout(4_000, async (): Promise<void> => {
      await redis.connect();
      pongResult = await redis.ping();
      await redis.quit();
    });
    const latencyMs = Date.now() - t0;
    return { ok: pongResult === "PONG", latencyMs, detail: `ping→${pongResult}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Evolution API ─────────────────────────────────────────────────────────────
async function checkEvolution(): Promise<CheckResult> {
  const t0     = Date.now();
  const server = process.env.EVOLUTION_SERVER_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!server) return { ok: false, error: "EVOLUTION_SERVER_URL not set" };
  if (!apiKey) return { ok: false, error: "EVOLUTION_API_KEY not set" };

  const url = `${server.replace(/\/$/, "")}/instance/fetchInstances`;
  try {
    const r = await withTimeout(5_000, () =>
      fetch(url, { headers: { apikey: apiKey }, signal: AbortSignal.timeout(4_500) })
    );
    const latencyMs = Date.now() - t0;
    if ("timedOut" in r) return { ok: false, latencyMs, error: "Evolution API timed out" };

    const res = r as Response;
    if (res.status === 401 || res.status === 403) {
      return { ok: false, latencyMs, error: `HTTP ${res.status} — API key rejected`, detail: `key=${apiKey.slice(0, 8)}…` };
    }
    if (!res.ok) return { ok: false, latencyMs, error: `HTTP ${res.status}` };

    const data = await res.json().catch(() => []) as unknown[];
    return { ok: true, latencyMs, detail: `${Array.isArray(data) ? data.length : "?"} instance(s)` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── WhatsApp session ──────────────────────────────────────────────────────────
async function checkWhatsAppSession(): Promise<CheckResult> {
  try {
    const r = await withTimeout(5_000, async () =>
      createAdminClient()
        .from("whatsapp_instances")
        .select("instance_name, connection_state")
        .eq("connection_state", "open")
        .limit(5)
    );
    if ("timedOut" in r) return { ok: false, error: "DB timed out" };
    if (r.error)          return { ok: false, error: r.error.message };

    const open = (r.data ?? []) as { instance_name: string }[];
    if (open.length === 0) return { ok: false, detail: "No open WhatsApp instances" };
    return { ok: true, detail: `${open.length} open: ${open.map((i) => i.instance_name).join(", ")}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Environment variables ─────────────────────────────────────────────────────
function checkEnvVars(): CheckResult {
  const required = [
    "REDIS_URL", "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL", "EVOLUTION_SERVER_URL", "EVOLUTION_API_KEY",
  ];
  const missing = required.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) return { ok: false, error: `Missing: ${missing.join(", ")}` };

  // Detect the EVOLUTION_API_KEY == EVOLUTION_WEBHOOK_SECRET misconfiguration
  const evoKey   = process.env.EVOLUTION_API_KEY ?? "";
  const whSecret = process.env.EVOLUTION_WEBHOOK_SECRET ?? "";
  if (evoKey && whSecret && evoKey === whSecret) {
    return { ok: false, detail: "EVOLUTION_API_KEY equals EVOLUTION_WEBHOOK_SECRET — misconfiguration" };
  }
  return { ok: true, detail: `${required.length}/${required.length} vars present` };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET() {
  const [supabase, redis, evolution, whatsapp] = await Promise.all([
    checkSupabase(),
    checkRedis(),
    checkEvolution(),
    checkWhatsAppSession(),
  ]);
  const envVars = checkEnvVars();
  const checks  = { envVars, supabase, redis, evolution, whatsapp };
  const allOk   = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    { ok: allOk, ts: new Date().toISOString(), checks },
    { status: allOk ? 200 : 503 }
  );
}
