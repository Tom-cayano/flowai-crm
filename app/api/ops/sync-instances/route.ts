// GET /api/ops/sync-instances
//
// Syncs all Evolution API instances into whatsapp_instances table.
// Safe to call multiple times (upsert by instance_name).
//
// Three-tier user resolution (applied in order):
//   1. UUID prefix: instance name starts with 8-char UUID segment
//      e.g. "2da9c9b6-flowai" → user whose UUID starts with "2da9c9b6"
//   2. EVOLUTION_FALLBACK_USER_ID env var (explicit override)
//   3. Workspace owner: oldest user account in auth.users (initial admin)
//
// Each resolution logs which tier was used.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

interface EvolutionInstance {
  name: string;
  id: string;
  connectionStatus: string;
  ownerJid?: string | null;
  profileName?: string | null;
  profilePicUrl?: string | null;
  token?: string;
}

type ResolutionTier = "uuid-prefix" | "fallback-env" | "workspace-owner";

interface ResolutionResult {
  userId: string;
  tier: ResolutionTier;
}

function resolveUser(
  instanceName: string,
  prefixToUser: Map<string, string>,
  fallbackUserId: string | null,
  workspaceOwnerId: string | null
): ResolutionResult | null {
  // Tier 1 — UUID prefix (e.g. "2da9c9b6-flowai" → prefix "2da9c9b6")
  const nameParts = instanceName.split("-");
  const prefix    = nameParts[0] ?? "";
  const byPrefix  = prefix ? prefixToUser.get(prefix) : null;
  if (byPrefix) {
    console.log(`[sync-instances] "${instanceName}" → resolved via uuid-prefix "${prefix}" → ${byPrefix}`);
    return { userId: byPrefix, tier: "uuid-prefix" };
  }

  // Tier 2 — EVOLUTION_FALLBACK_USER_ID
  if (fallbackUserId) {
    console.log(`[sync-instances] "${instanceName}" → uuid-prefix "${prefix}" not found; using EVOLUTION_FALLBACK_USER_ID ${fallbackUserId}`);
    return { userId: fallbackUserId, tier: "fallback-env" };
  }

  // Tier 3 — workspace owner (oldest account)
  if (workspaceOwnerId) {
    console.log(`[sync-instances] "${instanceName}" → uuid-prefix "${prefix}" not found, no fallback env; using workspace owner ${workspaceOwnerId}`);
    return { userId: workspaceOwnerId, tier: "workspace-owner" };
  }

  console.warn(`[sync-instances] WARNING: "${instanceName}" — all three resolution tiers failed. Instance will NOT be registered.`);
  return null;
}

export async function GET() {
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
  console.log(`[sync-instances] Found ${instances.length} Evolution instance(s):`, instances.map((i) => i.name));

  // 2. Load all users via the profiles table (avoids auth.admin.listUsers() which
  //    requires a special Supabase permission not always available on all plans).
  const db = createAdminClient();

  const { data: profiles, error: profilesError } = await db
    .from("profiles")
    .select("id, email, created_at")
    .order("created_at", { ascending: true });

  if (profilesError) {
    return NextResponse.json({ error: "Failed to list profiles", detail: profilesError.message }, { status: 500 });
  }

  const allProfiles = profiles ?? [];

  // Map: 8-char UUID prefix (no dashes) → full user_id
  const prefixToUser = new Map<string, string>();
  for (const p of allProfiles) {
    const prefix = p.id.split("-")[0];
    if (prefix) prefixToUser.set(prefix, p.id);
  }

  // Tier 2: explicit fallback from env
  const fallbackUserId = process.env.EVOLUTION_FALLBACK_USER_ID?.trim() || null;

  // Tier 3: workspace owner from the workspaces table
  const { data: firstWorkspace } = await db
    .from("workspaces")
    .select("owner_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const workspaceOwnerId = firstWorkspace?.owner_id ?? allProfiles[0]?.id ?? null;

  console.log(`[sync-instances] Profiles loaded: ${allProfiles.length}, fallbackUserId: ${fallbackUserId ?? "not set"}, workspaceOwner: ${workspaceOwnerId ?? "none"} (${allProfiles.find((p) => p.id === workspaceOwnerId)?.email ?? "unknown email"})`);

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

    const resolution = resolveUser(name, prefixToUser, fallbackUserId, workspaceOwnerId);

    if (!resolution) {
      const reason = `All resolution tiers failed — no uuid-prefix match, EVOLUTION_FALLBACK_USER_ID not set, no users in DB`;
      console.warn(`[sync-instances] SKIPPED "${name}": ${reason}`);
      results.push({ instance: name, action: "skipped", reason });
      continue;
    }

    const nameParts = name.split("-");
    // If resolved by uuid-prefix, label is everything after the first segment.
    // Otherwise keep the full instance name as the label.
    const label =
      resolution.tier === "uuid-prefix"
        ? (nameParts.slice(1).join("-") || name)
        : name;

    const connState = (["open", "close", "connecting"].includes(inst.connectionStatus ?? "")
      ? inst.connectionStatus
      : "close") as "open" | "close" | "connecting";

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
      results.push({ instance: name, action: "error", resolvedBy: resolution.tier, userId: resolution.userId, reason: error.message });
    } else {
      console.log(`[sync-instances] Upserted "${name}" → user ${resolution.userId} (${resolution.tier})`);
      results.push({ instance: name, action: "upserted", resolvedBy: resolution.tier, userId: resolution.userId });
    }
  }

  const summary = {
    instanceCount: instances.length,
    processed: results.length,
    upserted:  results.filter((r) => r.action === "upserted").length,
    skipped:   results.filter((r) => r.action === "skipped").length,
    errors:    results.filter((r) => r.action === "error").length,
    resolutionBreakdown: {
      byUuidPrefix:    results.filter((r) => r.resolvedBy === "uuid-prefix").length,
      byFallbackEnv:   results.filter((r) => r.resolvedBy === "fallback-env").length,
      byWorkspaceOwner:results.filter((r) => r.resolvedBy === "workspace-owner").length,
    },
    results,
  };

  console.log("[sync-instances] Done:", JSON.stringify({ ...summary, results: undefined }));
  return NextResponse.json(summary);
}
