// Proxy: GET /api/whatsapp/instances/[instanceName]/status
//
// Returns the live connection state from Evolution API and syncs it to
// Supabase. The QR modal polls this to know when the user has scanned.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { evolutionClient } from "@/lib/evolution/client";

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

  const { data: instance, error } = await supabase
    .from("whatsapp_instances")
    .select("server_url, api_key")
    .eq("instance_name", instanceName)
    .eq("user_id", user.id)
    .single();

  if (error || !instance) {
    return NextResponse.json({ error: "Instance not found" }, { status: 404 });
  }

  const client = evolutionClient(instance.server_url, instance.api_key);
  const result = await client.getConnectionState(instanceName);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const state = result.data.instance.state;

  // Keep DB in sync (webhook may not fire immediately on connect)
  await supabase
    .from("whatsapp_instances")
    .update({ connection_state: state })
    .eq("instance_name", instanceName)
    .eq("user_id", user.id);

  return NextResponse.json({ state });
}
