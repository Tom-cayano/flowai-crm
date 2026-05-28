// POST /api/meta/connect/wac
//   Body: { wabaId, phoneNumberId, systemUserToken }
//   Validates the token against the Meta Graph API, encrypts it, and saves to
//   whatsapp_cloud_accounts. Safe to call on reconnect (upserts by phoneNumberId).
//
// DELETE /api/meta/connect/wac
//   Body: { accountId }
//   Soft-deletes the account (sets is_active = false).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { encryptToken } from "@/lib/instagram/token-store";
import { getPhoneNumbers } from "@/lib/meta/whatsapp";

export const dynamic = "force-dynamic";

// ─── POST — connect ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = await getUserPrimaryWorkspace(user.id);
  if (!workspaceId) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  let body: { wabaId?: string; phoneNumberId?: string; systemUserToken?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { wabaId, phoneNumberId, systemUserToken } = body;
  if (!wabaId || !phoneNumberId || !systemUserToken) {
    return NextResponse.json(
      { error: "wabaId, phoneNumberId, and systemUserToken are required" },
      { status: 400 }
    );
  }

  // ── Validate token by fetching phone number details from Meta ─────────────
  let displayPhoneNumber: string | null = null;
  let verifiedName: string | null = null;

  try {
    const phones = await getPhoneNumbers(wabaId, systemUserToken);
    const match  = phones.find((p) => p.id === phoneNumberId);
    if (!match) {
      return NextResponse.json(
        { error: `phoneNumberId ${phoneNumberId} not found in WABA ${wabaId}` },
        { status: 422 }
      );
    }
    displayPhoneNumber = match.display_phone_number ?? null;
    verifiedName       = match.verified_name ?? null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Meta API validation failed: ${msg}` },
      { status: 422 }
    );
  }

  // ── Encrypt token + persist ────────────────────────────────────────────────
  const accessTokenEnc = encryptToken(systemUserToken);
  const db = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: account, error: upsertErr } = await (db as any)
    .from("whatsapp_cloud_accounts")
    .upsert(
      {
        workspace_id:          workspaceId,
        user_id:               user.id,
        waba_id:               wabaId,
        phone_number_id:       phoneNumberId,
        display_phone_number:  displayPhoneNumber,
        verified_name:         verifiedName,
        access_token_enc:      accessTokenEnc,
        connection_state:      "connected",
        last_error:            null,
        last_synced_at:        new Date().toISOString(),
        is_active:             true,
        updated_at:            new Date().toISOString(),
      },
      { onConflict: "workspace_id,phone_number_id" }
    )
    .select("id, phone_number_id, display_phone_number, verified_name, connection_state")
    .single() as { data: { id: string; phone_number_id: string; display_phone_number: string | null; verified_name: string | null; connection_state: string } | null; error: unknown };

  if (upsertErr || !account) {
    console.error("[meta/connect/wac] upsert failed:", upsertErr);
    return NextResponse.json({ error: "Failed to save account" }, { status: 500 });
  }

  return NextResponse.json({
    ok:                  true,
    accountId:           account.id,
    phoneNumberId:       account.phone_number_id,
    displayPhoneNumber:  account.display_phone_number,
    verifiedName:        account.verified_name,
    connectionState:     account.connection_state,
  });
}

// ─── DELETE — disconnect ──────────────────────────────────────────────────────

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { accountId?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.accountId) {
    return NextResponse.json({ error: "accountId required" }, { status: 400 });
  }

  const db = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from("whatsapp_cloud_accounts")
    .update({ is_active: false, connection_state: "disconnected", updated_at: new Date().toISOString() })
    .eq("id", body.accountId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[meta/connect/wac] disconnect failed:", error);
    return NextResponse.json({ error: "Failed to disconnect account" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
