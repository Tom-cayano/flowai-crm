// POST /api/integrations/:id/test — send a sample webhook through the real
// pipeline (auth → contact upsert → automations → logs), exactly as the
// external application would.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeHmacSignature } from "@/lib/integrations/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: integration } = await supabase
    .from("webhook_integrations")
    .select("id, name, source_key, token, hmac_secret")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!integration) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const samplePayload = {
    source: integration.name,
    event:  "test_webhook",
    contact: {
      name:  `Prueba ${integration.name}`,
      email: `test+${integration.source_key}@flowai.test`,
      tags:  ["webhook-test"],
    },
    custom_data: {
      test:    true,
      sent_at: new Date().toISOString(),
    },
  };

  const rawBody = JSON.stringify(samplePayload);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || req.nextUrl.origin;

  const headers: Record<string, string> = {
    "content-type":      "application/json",
    "authorization":     `Bearer ${integration.token}`,
    "x-idempotency-key": `test-${id}-${Date.now()}`,
  };
  if (integration.hmac_secret) {
    headers["x-flowai-signature"] = computeHmacSignature(rawBody, integration.hmac_secret);
  }

  try {
    const res = await fetch(`${baseUrl}/api/webhooks/leads`, {
      method: "POST",
      headers,
      body:   rawBody,
      signal: AbortSignal.timeout(15_000),
    });

    const result = await res.json().catch(() => null);

    return NextResponse.json({
      success:      res.ok,
      status:       res.status,
      sent_payload: samplePayload,
      response:     result,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error:   err instanceof Error ? err.message : "Test request failed",
        sent_payload: samplePayload,
      },
      { status: 502 }
    );
  }
}
