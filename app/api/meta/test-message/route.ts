// POST /api/meta/test-message
//
// Sends a real test message through the connected channel.
// Used by the integrations UI to verify a channel works end-to-end.
//
// Body:
//   channel: "wac"       → WhatsApp Cloud API
//   accountId: string    → whatsapp_cloud_accounts.id
//   to: string           → recipient phone (E.164 with or without +)
//   message?: string     → optional custom text (defaults to canned test string)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptToken } from "@/lib/instagram/token-store";
import { sendText } from "@/lib/meta/whatsapp";

export const dynamic = "force-dynamic";

const DEFAULT_MESSAGE = "👋 Mensaje de prueba desde FlowAI CRM. ¡Todo funciona correctamente!";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { channel?: string; accountId?: string; to?: string; message?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { channel, accountId, to, message } = body;
  if (!channel || !accountId || !to) {
    return NextResponse.json({ error: "channel, accountId, and to are required" }, { status: 400 });
  }

  // Normalise phone: WAC expects E.164 without the leading +
  const normalizedTo = to.replace(/^\+/, "").replace(/\s/g, "");

  if (channel === "wac") {
    return handleWACTest(user.id, accountId, normalizedTo, message ?? DEFAULT_MESSAGE);
  }

  return NextResponse.json({ error: `Unsupported channel: ${channel}` }, { status: 400 });
}

// ─── WAC test ─────────────────────────────────────────────────────────────────

async function handleWACTest(
  userId:    string,
  accountId: string,
  to:        string,
  message:   string,
): Promise<NextResponse> {
  const db = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: account } = await (db as any)
    .from("whatsapp_cloud_accounts")
    .select("phone_number_id, access_token_enc, display_phone_number, verified_name")
    .eq("id", accountId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle() as {
      data: {
        phone_number_id:     string;
        access_token_enc:    string;
        display_phone_number: string | null;
        verified_name:       string | null;
      } | null
    };

  if (!account) {
    return NextResponse.json({ error: "Account not found or inactive" }, { status: 404 });
  }

  let accessToken: string;
  try {
    accessToken = decryptToken(account.access_token_enc);
  } catch {
    return NextResponse.json({ error: "Failed to decrypt access token" }, { status: 500 });
  }

  try {
    const result = await sendText(account.phone_number_id, to, message, accessToken);
    return NextResponse.json({
      ok:       true,
      wamid:    result.messages[0]?.id,
      from:     account.display_phone_number ?? account.phone_number_id,
      to,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[meta/test-message] WAC send failed:", err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
