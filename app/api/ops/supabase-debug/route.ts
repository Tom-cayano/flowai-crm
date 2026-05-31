// GET /api/ops/supabase-debug
//
// Verifies which Supabase key is active in this Vercel deployment.
// Checks: SUPABASE_SERVICE_ROLE_KEY role claim (service_role vs anon),
//         write access to whatsapp_instances, and auth.admin access.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function decodeJwtRole(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    return typeof decoded.role === "string" ? decoded.role : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const anonKey        = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  const keyRole    = serviceRoleKey ? decodeJwtRole(serviceRoleKey) : null;
  const keyLength  = serviceRoleKey.length;
  const keyPrefix  = serviceRoleKey ? serviceRoleKey.slice(0, 20) + "…" : "MISSING";
  const isServiceRole = keyRole === "service_role";
  const isAnon        = keyRole === "anon";
  const sameAsAnon    = !!anonKey && serviceRoleKey === anonKey;

  const keyReport = {
    present:       !!serviceRoleKey,
    length:        keyLength,
    prefix:        keyPrefix,
    jwtRole:       keyRole ?? "could not decode",
    isServiceRole,
    isAnon,
    sameAsAnonKey: sameAsAnon,
    diagnosis: !serviceRoleKey
      ? "MISSING — set SUPABASE_SERVICE_ROLE_KEY in Vercel env vars"
      : sameAsAnon
        ? "WRONG KEY — SUPABASE_SERVICE_ROLE_KEY is the same as the anon key"
        : isAnon
          ? "WRONG KEY — this is the anon/public key, not the service role key. Get the service role key from Supabase → Settings → API"
          : isServiceRole
            ? "OK — key is service_role, should bypass RLS"
            : `UNKNOWN — JWT role is "${keyRole}" (expected "service_role")`,
  };

  // Test 1: write test (admin client should bypass RLS)
  let writeTest: { ok: boolean; error: string | null } = { ok: false, error: null };
  let authAdminTest: { ok: boolean; error: string | null } = { ok: false, error: null };

  if (serviceRoleKey) {
    try {
      const db = createAdminClient();

      // Try a no-op update that touches no rows (safe read via count)
      const { error } = await db
        .from("whatsapp_instances")
        .select("id", { count: "exact", head: true });

      writeTest = {
        ok: !error,
        error: error?.message ?? null,
      };
    } catch (err) {
      writeTest = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }

    try {
      const db = createAdminClient();
      const { error } = await db.auth.admin.listUsers({ perPage: 1 });
      authAdminTest = {
        ok: !error,
        error: error?.message ?? null,
      };
    } catch (err) {
      authAdminTest = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    SUPABASE_SERVICE_ROLE_KEY: keyReport,
    tests: {
      selectWhatsappInstances: writeTest,
      authAdminListUsers: authAdminTest,
    },
    action: isServiceRole
      ? "Key looks correct. If RLS errors persist, check table policies in Supabase → Table Editor → whatsapp_instances → RLS."
      : "Fix: Go to Supabase Dashboard → Settings → API → copy the 'Service role key' (secret) → update SUPABASE_SERVICE_ROLE_KEY in Vercel → Redeploy.",
  });
}
