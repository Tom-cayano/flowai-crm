// GET /api/ops/test-outbound?userId=<uuid>&phone=<e164>
//
// Diagnostic endpoint — walks the full outbound path and returns what would
// happen when an agent sends a message from the CRM:
//   1. Lists all whatsapp_instances rows for the user
//   2. Picks the first open instance
//   3. Fires a real POST to Evolution API (/message/sendText/<instanceName>)
//      with a test payload and returns the exact HTTP status + body
//
// Use ?dryRun=1 to skip the actual Evolution API call and only check DB state.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OWNER_UUID = "2da9c9b6-2efe-4137-a94a-dea999cb404d";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const userId  = searchParams.get("userId")  ?? OWNER_UUID;
  const phone   = searchParams.get("phone")   ?? "5511999999999";
  const dryRun  = searchParams.get("dryRun")  === "1";

  const admin = createAdminClient();

  // ── 1. List all instances for this user ───────────────────────────────────
  const { data: instances, error: instErr } = await admin
    .from("whatsapp_instances")
    .select("id, instance_name, server_url, api_key, connection_state, is_active, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (instErr) {
    return NextResponse.json({
      step: "list_instances",
      error: instErr.message,
      hint: "RLS blocking read — check worker_rls_bypass migration is applied",
    }, { status: 500 });
  }

  const openInstances = (instances ?? []).filter(i => i.connection_state === "open");

  if (!instances || instances.length === 0) {
    return NextResponse.json({
      step: "list_instances",
      result: "no_instances",
      userId,
      hint: "Run /api/ops/sync-instances?userId=" + userId + " to populate whatsapp_instances",
      instances: [],
    });
  }

  if (openInstances.length === 0) {
    return NextResponse.json({
      step: "pick_open_instance",
      result: "no_open_instance",
      userId,
      allInstances: instances.map(i => ({
        id: i.id,
        instance_name: i.instance_name,
        connection_state: i.connection_state,
        server_url: i.server_url,
        has_api_key: Boolean(i.api_key),
      })),
      hint: "All instances are in 'close' state. Scan the QR code at /whatsapp to connect one.",
    });
  }

  const inst = openInstances[0];

  const instanceDiag = {
    id: inst.id,
    instance_name: inst.instance_name,
    connection_state: inst.connection_state,
    server_url: inst.server_url,
    api_key_preview: inst.api_key ? inst.api_key.slice(0, 8) + "…" : "MISSING",
    has_api_key: Boolean(inst.api_key),
  };

  if (dryRun) {
    return NextResponse.json({
      step: "dry_run",
      result: "would_send",
      instance: instanceDiag,
      would_post_to: `${inst.server_url?.replace(/\/$/, "")}/message/sendText/${inst.instance_name}`,
      would_phone: phone,
    });
  }

  if (!inst.server_url || !inst.api_key || !inst.instance_name) {
    return NextResponse.json({
      step: "validate_credentials",
      result: "missing_credentials",
      instance: instanceDiag,
      hint: "server_url, api_key, or instance_name is blank in the DB row",
    });
  }

  // ── 2. Fire a real Evolution API call ─────────────────────────────────────
  const url = `${inst.server_url.replace(/\/$/, "")}/message/sendText/${inst.instance_name}`;
  const body = JSON.stringify({
    number: phone,
    text:   "[FlowAI test-outbound] Se este mensaje llega, el envío funciona ✓",
    delay:  1200,
  });

  let evoStatus: number | null = null;
  let evoBody: unknown = null;
  let evoError: string | null = null;

  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json", apikey: inst.api_key },
      body,
      // 10-second timeout
      signal: AbortSignal.timeout(10_000),
    });
    evoStatus = res.status;
    evoBody   = await res.json().catch(() => res.text().catch(() => "(unreadable body)"));
  } catch (err) {
    evoError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    step: "evolution_send",
    instance: instanceDiag,
    request: { url, phone },
    response: {
      status: evoStatus,
      ok:     evoStatus !== null && evoStatus >= 200 && evoStatus < 300,
      body:   evoBody,
      error:  evoError,
    },
    hint: evoStatus === 401
      ? "401 = wrong api_key. Check EVOLUTION_API_KEY in Vercel and re-run sync-instances."
      : evoStatus === 404
      ? "404 = instance not found on Evolution server. Instance may have been deleted remotely."
      : evoStatus === null
      ? "null status = network error or timeout. Check EVOLUTION_SERVER_URL."
      : null,
  });
}
