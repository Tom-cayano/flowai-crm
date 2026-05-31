// GET /api/ops/test-outbound?userId=<uuid>&phone=<e164>&dryRun=1
//
// Diagnostic: walks the full outbound path and ALWAYS returns JSON within 8 s.
// Every external call is wrapped in a 5-second timeout so the function never hangs.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic    = "force-dynamic";
export const runtime    = "nodejs";
export const maxDuration = 30;

const OWNER_UUID = "2da9c9b6-2efe-4137-a94a-dea999cb404d";

function withTimeout<T>(ms: number, p: PromiseLike<T>): Promise<T | { timedOut: true }> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<{ timedOut: true }>(r => setTimeout(() => r({ timedOut: true }), ms)),
  ]);
}

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  console.log("[test-outbound] start", req.url);

  const { searchParams } = req.nextUrl;
  const userId = searchParams.get("userId") ?? OWNER_UUID;
  const phone  = searchParams.get("phone")  ?? "5511999999999";
  const dryRun = searchParams.get("dryRun") === "1";

  // ── env snapshot ─────────────────────────────────────────────────────────
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY  ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const env = {
    NEXT_PUBLIC_SUPABASE_URL:  (process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "MISSING").slice(0, 50),
    SUPABASE_SERVICE_ROLE_KEY: svcKey  ? svcKey.slice(0, 20)  + "…" : "MISSING",
    sameAsAnonKey:             !!(svcKey && anonKey && svcKey === anonKey),
    EVOLUTION_SERVER_URL:      (process.env.EVOLUTION_SERVER_URL ?? "MISSING").slice(0, 60),
    EVOLUTION_API_KEY:         process.env.EVOLUTION_API_KEY ? process.env.EVOLUTION_API_KEY.slice(0, 8) + "…" : "MISSING",
    REDIS_URL:                 process.env.REDIS_URL ? process.env.REDIS_URL.slice(0, 30) + "…" : "MISSING",
  };

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !svcKey) {
    return NextResponse.json({ step: "env_check", error: "Missing env vars", env });
  }

  // ── Step 1: Supabase query with 5 s timeout ───────────────────────────────
  console.log("[test-outbound] querying whatsapp_instances userId=", userId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbResult: any = null;
  let dbCrash: string | null = null;

  try {
    const admin = createAdminClient();
    dbResult = await withTimeout(5_000,
      admin
        .from("whatsapp_instances")
        .select("id, instance_name, server_url, api_key, connection_state, is_active, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
    );
  } catch (e) {
    dbCrash = e instanceof Error ? e.message : String(e);
  }

  if (dbCrash || !dbResult) {
    return NextResponse.json({
      step: "supabase_query", error: dbCrash ?? "null result", elapsedMs: Date.now() - t0, env,
    }, { status: 500 });
  }

  if ("timedOut" in dbResult) {
    return NextResponse.json({
      step: "supabase_query", timedOut: true, elapsedMs: Date.now() - t0, env,
      hint: "Supabase did not respond within 5 s. Free-tier project may be paused — visit supabase.com/dashboard to wake it.",
    }, { status: 500 });
  }

  const { data: rows, error: dbError } = dbResult as { data: unknown; error: { message: string } | null };
  if (dbError) {
    return NextResponse.json({
      step: "supabase_query", error: dbError.message, elapsedMs: Date.now() - t0, env,
      hint: "RLS may be blocking the read. Confirm worker_rls_bypass migration is applied in Supabase.",
    }, { status: 500 });
  }

  console.log("[test-outbound] got instances", { count: Array.isArray(rows) ? rows.length : "non-array" });

  type InstanceRow = {
    id: string; instance_name: string; server_url: string; api_key: string;
    connection_state: string; is_active: boolean; created_at: string;
  };
  const instances = (rows ?? []) as InstanceRow[];
  const openInstances = instances.filter(i => i.connection_state === "open");

  if (instances.length === 0) {
    return NextResponse.json({
      step: "list_instances", result: "no_instances", userId, elapsedMs: Date.now() - t0, env,
      hint: `No rows in whatsapp_instances. Run /api/ops/sync-instances?userId=${userId} first.`,
    });
  }

  if (openInstances.length === 0) {
    return NextResponse.json({
      step: "list_instances", result: "no_open_instance", userId, elapsedMs: Date.now() - t0, env,
      allInstances: instances.map(i => ({
        id: i.id, instance_name: i.instance_name,
        connection_state: i.connection_state, server_url: i.server_url,
        has_api_key: Boolean(i.api_key),
      })),
      hint: "All instances are 'close'. Scan the QR at /whatsapp to connect one.",
    });
  }

  const inst = openInstances[0];
  const instanceDiag = {
    id: inst.id, instance_name: inst.instance_name,
    connection_state: inst.connection_state, server_url: inst.server_url,
    api_key_preview: inst.api_key ? inst.api_key.slice(0, 8) + "…" : "MISSING",
    has_api_key: Boolean(inst.api_key),
  };

  if (dryRun) {
    return NextResponse.json({
      step: "dry_run", result: "would_send", elapsedMs: Date.now() - t0, env,
      instance: instanceDiag,
      would_post_to: `${inst.server_url?.replace(/\/$/, "")}/message/sendText/${inst.instance_name}`,
      would_phone: phone,
    });
  }

  if (!inst.server_url || !inst.api_key || !inst.instance_name) {
    return NextResponse.json({
      step: "validate_credentials", result: "missing_credentials",
      instance: instanceDiag, elapsedMs: Date.now() - t0,
    });
  }

  // ── Step 2: Evolution API with 8 s timeout ────────────────────────────────
  const evoUrl  = `${inst.server_url.replace(/\/$/, "")}/message/sendText/${inst.instance_name}`;
  const evoBody = JSON.stringify({ number: phone, text: "[FlowAI test-outbound] ✓", delay: 1200 });

  console.log("[test-outbound] POST to Evolution", evoUrl);

  let evoStatus: number | null = null;
  let evoRespBody: unknown     = null;
  let evoError:  string | null = null;
  let evoTimedOut              = false;

  try {
    const res = await withTimeout(8_000,
      fetch(evoUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: inst.api_key },
        body: evoBody,
      })
    );

    if ("timedOut" in res) {
      evoTimedOut = true;
      evoError    = "Evolution API timed out after 8 s";
    } else {
      const r = res as Response;
      evoStatus   = r.status;
      evoRespBody = await r.json().catch(() => r.text().catch(() => "(unreadable)"));
    }
  } catch (e) {
    evoError = e instanceof Error ? e.message : String(e);
  }

  console.log("[test-outbound] Evolution result", { evoStatus, evoTimedOut, evoError });

  return NextResponse.json({
    step: "evolution_send", elapsedMs: Date.now() - t0, env,
    instance: instanceDiag,
    request:  { url: evoUrl, phone },
    response: {
      status: evoStatus,
      ok:     evoStatus !== null && evoStatus >= 200 && evoStatus < 300,
      body:   evoRespBody,
      timedOut: evoTimedOut,
      error:  evoError,
    },
    hint: evoTimedOut
      ? "Evolution server unreachable or slow. Verify EVOLUTION_SERVER_URL is correct and the Railway service is running."
      : evoStatus === 401 ? "401 = wrong api_key stored in DB. Re-run sync-instances after fixing EVOLUTION_API_KEY in Vercel."
      : evoStatus === 404 ? "404 = instance name not found on Evolution server. Instance may have been deleted remotely."
      : null,
  });
}
