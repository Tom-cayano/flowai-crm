// Proxy: GET /api/whatsapp/instances/[instanceName]/qr
//
// Returns the current QR code base64 for an instance. The frontend polls this
// route every 2-3 s while the QR modal is open. Credentials never reach the
// browser — all Evolution API calls happen here on the server.

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

  // Verify ownership and check current connection state
  const { data: instance, error } = await supabase
    .from("whatsapp_instances")
    .select("id, connection_state")
    .eq("instance_name", instanceName)
    .eq("user_id", user.id)
    .single();

  if (error || !instance) {
    return NextResponse.json({ error: "Instance not found" }, { status: 404 });
  }

  if (instance.connection_state === "open") {
    return NextResponse.json({ connected: true });
  }

  let client;
  try {
    client = getEvolutionClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[qr/route] Evolution client init error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  let result;
  try {
    result = await client.getQRCode(instanceName);
  } catch (err) {
    // Network error / timeout — keep polling, don't hard-fail the modal
    console.warn("[qr/route] getQRCode threw:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({}, { status: 202 });
  }

  if (!result.ok) {
    // Any Evolution error during QR fetch → keep polling (return 202).
    // Never hard-fail the modal from a transient Evolution API error.
    console.warn("[qr/route] Evolution non-ok", { status: result.status, instanceName });
    await client.restartInstance(instanceName).catch(() => { /* non-blocking */ });
    return NextResponse.json({}, { status: 202 });
  }

  // result.data is EvolutionQRCode — extract base64 directly
  const base64 = result.data.base64 ?? null;
  if (!base64) {
    // QR not ready yet — keep polling
    return NextResponse.json({}, { status: 202 });
  }

  return NextResponse.json({ base64 });
}
