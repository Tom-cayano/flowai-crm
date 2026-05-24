// GET    /api/instagram/accounts        — list connected Instagram accounts
// DELETE /api/instagram/accounts?id=   — disconnect an account
// POST   /api/instagram/accounts/sync  — force-sync account profile from Meta

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPrimaryWorkspace, requirePermission, PermissionError } from "@/lib/rbac/permissions";
import { assertFeature, BillingError, billingErrorToResponse } from "@/lib/billing/guards";
import { getAccessToken } from "@/lib/instagram/token-store";
import { getIGUser } from "@/lib/instagram/client";

export const dynamic = "force-dynamic";

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = await getUserPrimaryWorkspace(user.id);
  if (!workspaceId) return NextResponse.json({ accounts: [] });

  const db = createAdminClient();
  const { data, error } = await db
    .from("instagram_accounts")
    .select("id, ig_user_id, ig_username, avatar_url, followers_count, connection_state, page_id, page_name, last_error, last_synced_at, created_at, is_active, token_expires_at")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ accounts: data ?? [] });
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accountId = req.nextUrl.searchParams.get("id");
  if (!accountId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const workspaceId = await getUserPrimaryWorkspace(user.id);
  if (!workspaceId) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  try {
    await requirePermission(workspaceId, "team.invite"); // owner/admin only
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const db = createAdminClient();

  // Soft-delete: mark inactive, clear encrypted token
  const { error } = await db
    .from("instagram_accounts")
    .update({
      is_active:        false,
      access_token_enc: "",   // clear token on disconnect
      connection_state: "disconnected",
      updated_at:       new Date().toISOString(),
    })
    .eq("id", accountId)
    .eq("workspace_id", workspaceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ disconnected: true });
}

// ─── POST /sync ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { accountId } = await req.json() as { accountId?: string };
  if (!accountId) return NextResponse.json({ error: "Missing accountId" }, { status: 400 });

  const workspaceId = await getUserPrimaryWorkspace(user.id);
  if (workspaceId) {
    try {
      await assertFeature(workspaceId, "instagram_dm");
    } catch (err) {
      if (err instanceof BillingError) {
        const { status, body } = billingErrorToResponse(err);
        return NextResponse.json(body, { status });
      }
    }
  }

  const token = await getAccessToken(accountId);
  if (!token) return NextResponse.json({ error: "Token not found" }, { status: 404 });

  try {
    const igUser = await getIGUser(token);
    const db = createAdminClient();

    await db.from("instagram_accounts").update({
      ig_username:     igUser.username,
      avatar_url:      (igUser as { profile_picture_url?: string }).profile_picture_url ?? null,
      followers_count: (igUser as { followers_count?: number }).followers_count ?? 0,
      connection_state: "connected",
      last_error:      null,
      last_synced_at:  new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    }).eq("id", accountId);

    return NextResponse.json({ synced: true, username: igUser.username });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
