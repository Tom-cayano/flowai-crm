// GET /api/ops/sync-instances[?userId=<uuid>]
//
// Syncs all Evolution API instances into whatsapp_instances table.
// Safe to call multiple times (upsert by instance_name).
//
// User resolution — applied in order:
//   0. ?userId=<uuid> query param (explicit override, highest priority)
//   1. UUID prefix: instance name starts with 8-char UUID segment
//      e.g. "2da9c9b6-flowai" → user whose profile.id starts with "2da9c9b6"
//   2. EVOLUTION_FALLBACK_USER_ID env var
//   3. Workspace owner: owner_id from first workspace, or oldest profile
//
// If profiles table is empty AND no env var is set AND no workspace exists,
// call with ?userId=<your-uuid> (find it in Supabase Dashboard → Auth → Users).

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// UUID v4 format: 8-4-4-4-12 hex chars
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface EvolutionInstance {
  name: string;
  id: string;
  connectionStatus: string;
  ownerJid?: string | null;
  profileName?: string | null;
  profilePicUrl?: string | null;
  token?: string;
}

type ResolutionTier = "query-param" | "uuid-prefix" | "fallback-env" | "workspace-owner";

interface ResolutionResult {
  userId: string;
  tier: ResolutionTier;
}

function resolveUser(
  instanceName: string,
  explicitUserId: string | null,
  prefixToUser: Map<string, string>,
  fallbackUserId: string | null,
  workspaceOwnerId: string | null
): ResolutionResult | null {
  // Tier 0 — explicit ?userId= query param
  if (explicitUserId) {
    console.log(`[sync-instances] "${instanceName}" → resolved via query-param → ${explicitUserId}`);
    return { userId: explicitUserId, tier: "query-param" };
  }

  // Tier 1 — UUID prefix (e.g. "2da9c9b6-flowai" → prefix "2da9c9b6")
  const nameParts = instanceName.split("-");
  const prefix    = nameParts[0] ?? "";
  const byPrefix  = prefix ? prefixToUser.get(prefix) : null;
  if (byPrefix) {
    console.log(`[sync-instances] "${instanceName}" → resolved via uuid-prefix "${prefix}" → ${byPrefix}`);
    return { userId: byPrefix, tier: "uuid-prefix" };
  }

  // Tier 2 — EVOLUTION_FALLBACK_USER_ID env var
  if (fallbackUserId) {
    console.log(`[sync-instances] "${instanceName}" → uuid-prefix "${prefix}" not found; using EVOLUTION_FALLBACK_USER_ID ${fallbackUserId}`);
    return { userId: fallbackUserId, tier: "fallback-env" };
  }

  // Tier 3 — workspace owner (first workspace or oldest profile)
  if (workspaceOwnerId) {
    console.log(`[sync-instances] "${instanceName}" → uuid-prefix "${prefix}" not found, no env fallback; using workspace owner ${workspaceOwnerId}`);
    return { userId: workspaceOwnerId, tier: "workspace-owner" };
  }

  console.warn(
    `[sync-instances] WARNING: "${instanceName}" — ALL resolution tiers failed.\n` +
    `  Fix options:\n` +
    `    A. Call with ?userId=<uuid>  (find in Supabase → Auth → Users)\n` +
    `    B. Set EVOLUTION_FALLBACK_USER_ID in Vercel env vars\n` +
    `    C. Ensure a workspace or profile row exists in the DB`
  );
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // Optional explicit userId override
  const rawUserId = searchParams.get("userId")?.trim() ?? null;
  const explicitUserId = rawUserId && UUID_RE.test(rawUserId) ? rawUserId : null;
  if (rawUserId && !explicitUserId) {
    return NextResponse.json({ error: `?userId="${rawUserId}" is not a valid UUID v4` }, { status: 400 });
  }

  const serverUrl = (process.env.EVOLUTION_SERVER_URL ?? "").replace(/\/$/, "");
  const apiKey    = (process.env.EVOLUTION_API_KEY ?? "").trim();

  if (!serverUrl || !apiKey) {
    return NextResponse.json(
      { error: "EVOLUTION_SERVER_URL or EVOLUTION_API_KEY not set" },
      { status: 500 }
    );
  }

  // 1. Fetch all Evolution API instances
  console.log(`[sync-instances] Fetching instances from ${serverUrl}`);
  const res = await fetch(`${serverUrl}/instance/fetchInstances`, {
    headers: { apikey: apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    return NextResponse.json({ error: `Evolution API error: ${res.status}` }, { status: 502 });
  }

  const instances = (await res.json()) as EvolutionInstance[];
  console.log(
    `[sync-instances] Found ${instances.length} Evolution instance(s):`,
    instances.map((i) => i.name)
  );

  const db = createAdminClient();

  // 2. Build prefix → userId map from profiles (Tier 1)
  const { data: profiles } = await db
    .from("profiles")
    .select("id, email, created_at")
    .order("created_at", { ascending: true });

  const allProfiles = profiles ?? [];
  const prefixToUser = new Map<string, string>();
  for (const p of allProfiles) {
    const prefix = p.id.split("-")[0];
    if (prefix) prefixToUser.set(prefix, p.id);
  }

  // Tier 2: explicit env fallback
  const fallbackUserId = process.env.EVOLUTION_FALLBACK_USER_ID?.trim() || null;

  // Tier 3: workspace owner
  const { data: firstWorkspace } = await db
    .from("workspaces")
    .select("owner_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const workspaceOwnerId = firstWorkspace?.owner_id ?? allProfiles[0]?.id ?? null;

  console.log(
    `[sync-instances] Resolution context:` +
    ` explicitUserId=${explicitUserId ?? "none"}` +
    ` profiles=${allProfiles.length}` +
    ` fallbackEnv=${fallbackUserId ?? "not set"}` +
    ` workspaceOwner=${workspaceOwnerId ?? "none"}`
  );

  const results: Array<{
    instance: string;
    action: "upserted" | "skipped" | "error";
    resolvedBy?: ResolutionTier;
    userId?: string;
    reason?: string;
  }> = [];

  // 3. Upsert each instance
  for (const inst of instances) {
    const name = inst.name;
    if (!name || name === "__auth_probe__") continue;

    const resolution = resolveUser(
      name,
      explicitUserId,
      prefixToUser,
      fallbackUserId,
      workspaceOwnerId
    );

    if (!resolution) {
      results.push({
        instance: name,
        action:   "skipped",
        reason:   "All resolution tiers failed — call with ?userId=<uuid> or set EVOLUTION_FALLBACK_USER_ID",
      });
      continue;
    }

    const nameParts = name.split("-");
    const label =
      resolution.tier === "uuid-prefix"
        ? (nameParts.slice(1).join("-") || name)
        : name;

    const connState = (
      ["open", "close", "connecting"].includes(inst.connectionStatus ?? "")
        ? inst.connectionStatus
        : "close"
    ) as "open" | "close" | "connecting";

    const { error } = await db
      .from("whatsapp_instances")
      .upsert(
        {
          user_id:          resolution.userId,
          instance_name:    name,
          server_url:       serverUrl,
          api_key:          inst.token ?? apiKey,
          connection_state: connState,
          is_active:        connState === "open",
          label,
          phone_number:     inst.ownerJid?.replace("@s.whatsapp.net", "") ?? null,
          display_name:     inst.profileName ?? null,
          avatar_url:       inst.profilePicUrl ?? null,
          webhook_set:      true,
          updated_at:       new Date().toISOString(),
        },
        { onConflict: "instance_name" }
      );

    if (error) {
      console.error(`[sync-instances] DB error for "${name}":`, error.message);
      results.push({
        instance:   name,
        action:     "error",
        resolvedBy: resolution.tier,
        userId:     resolution.userId,
        reason:     error.message,
      });
    } else {
      console.log(`[sync-instances] Upserted "${name}" → user ${resolution.userId} (${resolution.tier})`);
      results.push({
        instance:   name,
        action:     "upserted",
        resolvedBy: resolution.tier,
        userId:     resolution.userId,
      });
    }
  }

  const summary = {
    instanceCount: instances.length,
    processed:     results.length,
    upserted:      results.filter((r) => r.action === "upserted").length,
    skipped:       results.filter((r) => r.action === "skipped").length,
    errors:        results.filter((r) => r.action === "error").length,
    resolutionBreakdown: {
      byQueryParam:     results.filter((r) => r.resolvedBy === "query-param").length,
      byUuidPrefix:     results.filter((r) => r.resolvedBy === "uuid-prefix").length,
      byFallbackEnv:    results.filter((r) => r.resolvedBy === "fallback-env").length,
      byWorkspaceOwner: results.filter((r) => r.resolvedBy === "workspace-owner").length,
    },
    hint: results.some((r) => r.action === "skipped")
      ? "Some instances were skipped. Pass ?userId=<uuid> (Supabase → Auth → Users) to force-assign them."
      : null,
    results,
  };

  console.log("[sync-instances] Done:", JSON.stringify({ ...summary, results: undefined }));
  return NextResponse.json(summary);
}
