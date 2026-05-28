// GET /api/ops/sync-instances
//
// Syncs all Evolution API instances into whatsapp_instances table.
// Safe to call multiple times (upsert by instance_name + user_id).
//
// Instance naming convention: {userId_prefix}-{label}
// e.g. "2da9c9b6-marketing" → user whose UUID starts with "2da9c9b6"

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

export async function GET() {
  const serverUrl = (process.env.EVOLUTION_SERVER_URL ?? "").replace(/\/$/, "");
  const apiKey    = (process.env.EVOLUTION_API_KEY ?? "").trim();

  if (!serverUrl || !apiKey) {
    return NextResponse.json({ error: "EVOLUTION_SERVER_URL or EVOLUTION_API_KEY not set" }, { status: 500 });
  }

  // 1. Fetch all Evolution API instances
  const res = await fetch(`${serverUrl}/instance/fetchInstances`, {
    headers: { apikey: apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    return NextResponse.json({ error: `Evolution API error: ${res.status}` }, { status: 502 });
  }

  const instances = (await res.json()) as EvolutionInstance[];

  // 2. Get all users from Supabase to resolve instance → user_id
  const db = createAdminClient();
  const { data: { users }, error: usersError } = await db.auth.admin.listUsers();
  if (usersError) {
    return NextResponse.json({ error: "Failed to list users", detail: usersError.message }, { status: 500 });
  }

  // Build a map: uuid_prefix (8 chars, no dashes) → full user_id
  const prefixToUser = new Map<string, string>();
  for (const user of users ?? []) {
    // "2da9c9b6-2efe-..." → prefix "2da9c9b6"
    const prefix = user.id.split("-")[0];
    if (prefix) prefixToUser.set(prefix, user.id);
  }

  const results: Array<{
    instance: string;
    action: "upserted" | "skipped" | "error";
    reason?: string;
  }> = [];

  // 3. For each Evolution instance, upsert into whatsapp_instances
  for (const inst of instances) {
    const name = inst.name;
    if (!name || name === "__auth_probe__") continue;

    // Resolve user from name prefix
    const nameParts = name.split("-");
    const prefix = nameParts[0];
    const userId = prefix ? prefixToUser.get(prefix) : null;

    if (!userId) {
      results.push({ instance: name, action: "skipped", reason: `No user found for prefix "${prefix}"` });
      continue;
    }

    // Label is everything after the first dash
    const label = nameParts.slice(1).join("-") || name;

    const { error } = await db
      .from("whatsapp_instances")
      .upsert(
        {
          user_id:          userId,
          instance_name:    name,
          server_url:       serverUrl,
          api_key:          inst.token ?? apiKey,
          connection_state: (["open","close","connecting"].includes(inst.connectionStatus ?? "") ? inst.connectionStatus : "close") as "open" | "close" | "connecting",
          is_active:        inst.connectionStatus === "open",
          label:            label,
          phone_number:     inst.ownerJid?.replace("@s.whatsapp.net", "") ?? null,
          display_name:     inst.profileName ?? null,
          avatar_url:       inst.profilePicUrl ?? null,
          webhook_set:      true,
          updated_at:       new Date().toISOString(),
        },
        { onConflict: 'instance_name' }
      );

    if (error) {
      results.push({ instance: name, action: "error", reason: error.message });
    } else {
      results.push({ instance: name, action: "upserted" });
    }
  }

  return NextResponse.json({
    instanceCount: instances.length,
    processed: results.length,
    upserted: results.filter((r) => r.action === "upserted").length,
    skipped:  results.filter((r) => r.action === "skipped").length,
    errors:   results.filter((r) => r.action === "error").length,
    results,
  });
}
