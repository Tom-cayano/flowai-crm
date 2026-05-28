// Proxy: GET /api/whatsapp/instances/[instanceName]/status
//
// Returns the live connection state from Evolution API and syncs it to
// Supabase. The QR modal polls this to know when the user has scanned.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEvolutionClient } from "@/lib/evolution-client";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ instanceName: string }> }
) {
  const { instanceName } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership — we no longer need server_url/api_key from DB
  const { data: instance, error } = await supabase
    .from("whatsapp_instances")
    .select("id")
    .eq("instance_name", instanceName)
    .eq("user_id", user.id)
    .single();

  if (error || !instance) {
    return NextResponse.json({ error: "Instance not found" }, { status: 404 });
  }

  let client;
  try {
    client = getEvolutionClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[status/route] Evolution client init error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const result = await client.getConnectionState(instanceName);

  if (!result.ok) {
    const errMsg =
      typeof result.data === "object" && result.data !== null && "message" in result.data
        ? String((result.data as { message: string }).message)
        : `HTTP ${result.status}`;
    return NextResponse.json({ error: errMsg }, { status: 502 });
  }

  const rawState = result.data.instance.state;
  const state = rawState as "open" | "close" | "connecting";

  // Keep DB in sync (webhook may not fire immediately on connect)
  await supabase
    .from("whatsapp_instances")
    .update({ connection_state: state })
    .eq("instance_name", instanceName)
    .eq("user_id", user.id);

  return NextResponse.json({ state });
}
