// GET /api/ops/evolution-debug
//
// Diagnostic endpoint — verifies Evolution API env vars are loaded correctly
// in the Vercel runtime and tests connectivity against the configured server.
//
// REMOVE or gate behind an admin check before going fully public.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const serverUrl = process.env.EVOLUTION_SERVER_URL ?? "";
  const apiKey    = process.env.EVOLUTION_API_KEY ?? "";
  const trimmedKey = apiKey.trim().replace(/[\r\n\t]/g, "");

  const envReport = {
    EVOLUTION_SERVER_URL: {
      present:   !!serverUrl,
      length:    serverUrl.length,
      value:     serverUrl || "MISSING",
    },
    EVOLUTION_API_KEY: {
      present:    !!apiKey,
      rawLength:  apiKey.length,
      trimLength: trimmedKey.length,
      hasWhitespace: apiKey !== trimmedKey,
      prefix:     trimmedKey ? trimmedKey.slice(0, 6) + "…" : "MISSING",
    },
  };

  // Live connectivity test: GET /instance/fetchInstances
  let connectivityTest: {
    status: number | null;
    ok: boolean;
    error: string | null;
    instanceCount?: number;
  } = { status: null, ok: false, error: null };

  if (serverUrl && trimmedKey) {
    try {
      const url = `${serverUrl.replace(/\/$/, "")}/instance/fetchInstances`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "apikey": trimmedKey,
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(8_000),
      });

      const text = await res.text();
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { parsed = text; }

      connectivityTest = {
        status: res.status,
        ok: res.ok,
        error: res.ok ? null : (typeof parsed === "object" && parsed !== null
          ? JSON.stringify((parsed as Record<string, unknown>).response ?? parsed).slice(0, 200)
          : text.slice(0, 200)),
        instanceCount: Array.isArray(parsed) ? parsed.length : undefined,
      };
    } catch (err) {
      connectivityTest = {
        status: null,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // Test POST /instance/create auth (dry-run with a probe name that will fail validation)
  // This lets us distinguish "wrong key" (401) from "key ok but duplicate name" (400/409)
  let createAuthTest: { status: number | null; error: string | null; authOk: boolean } =
    { status: null, error: null, authOk: false };

  if (serverUrl && trimmedKey) {
    try {
      const url = `${serverUrl.replace(/\/$/, "")}/instance/create`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "apikey": trimmedKey,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          instanceName: "__auth_probe__",
          qrcode: false,
          integration: "WHATSAPP-BAILEYS",
        }),
        signal: AbortSignal.timeout(8_000),
      });

      const text = await res.text();
      createAuthTest = {
        status: res.status,
        // 401 = wrong key; 400/409/422 = key was accepted but request had a problem
        authOk: res.status !== 401 && res.status !== 403,
        error: res.ok ? null : text.slice(0, 200),
      };
    } catch (err) {
      createAuthTest = {
        status: null,
        authOk: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    env: envReport,
    connectivity: {
      fetchInstances: connectivityTest,
      createInstance: createAuthTest,
    },
    diagnosis: buildDiagnosis(envReport, connectivityTest, createAuthTest),
  });
}

function buildDiagnosis(
  env: ReturnType<typeof buildEnvReport>,
  fetch: { ok: boolean; status: number | null },
  create: { authOk: boolean; status: number | null }
): string {
  if (!env.EVOLUTION_API_KEY.present) return "EVOLUTION_API_KEY not set in Vercel env vars";
  if (env.EVOLUTION_API_KEY.hasWhitespace) return "EVOLUTION_API_KEY has whitespace — it will be trimmed automatically but check the raw value";
  if (!fetch.ok && fetch.status === 401) return "API key wrong for fetchInstances — key does not match AUTHENTICATION_API_KEY on Railway";
  if (fetch.ok && !create.authOk && create.status === 401) return "KEY IS AN INSTANCE TOKEN — works for fetchInstances but rejected for createInstance. You need the global AUTHENTICATION_API_KEY from Railway.";
  if (fetch.ok && create.authOk) return "OK — key is the global AUTHENTICATION_API_KEY, createInstance auth passes";
  if (!fetch.ok) return `fetchInstances returned HTTP ${fetch.status} — check server URL and key`;
  return "Unknown state — check raw response values above";
}

// TS helper to make the diagnosis function signature match
type EnvReport = {
  EVOLUTION_SERVER_URL: { present: boolean; length: number; value: string };
  EVOLUTION_API_KEY: { present: boolean; rawLength: number; trimLength: number; hasWhitespace: boolean; prefix: string };
};
function buildEnvReport(env: EnvReport) { return env; }
void buildEnvReport;
