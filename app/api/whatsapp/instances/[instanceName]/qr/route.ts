// Proxy: GET /api/whatsapp/instances/[instanceName]/qr
//
// Returns the current QR code base64 for an instance. The frontend polls this
// route every 2-3 s while the QR modal is open. Credentials never reach the
// browser — all Evolution API calls happen here on the server.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { evolutionClient, extractQRBase64 } from "@/lib/evolution/client";

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
    .select("server_url, api_key, connection_state")
    .eq("instance_name", instanceName)
    .eq("user_id", user.id)
    .single();

  if (error || !instance) {
    return NextResponse.json({ error: "Instance not found" }, { status: 404 });
  }

  if (instance.connection_state === "open") {
    return NextResponse.json({ connected: true });
  }

  const client = evolutionClient(instance.server_url, instance.api_key);
  const result = await client.getQRCode(instanceName);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const base64 = extractQRBase64(result.data);
  if (!base64) {
    return NextResponse.json(
      { error: "QR not ready — retry in a few seconds" },
      { status: 202 }
    );
  }

  return NextResponse.json({ base64 });
}
