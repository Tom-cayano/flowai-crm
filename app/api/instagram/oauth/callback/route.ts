// GET /api/instagram/oauth/callback
//
// Meta redirects here after the user grants permissions in the Facebook Login
// dialog. This route:
//   1. Exchanges the short-lived code for a long-lived user token (60 days)
//   2. Fetches the Instagram Business account(s) linked to the authorized pages
//   3. Stores the encrypted token in instagram_accounts
//   4. Subscribes the page to receive webhook events
//   5. Redirects to the settings page
//
// Flow (Meta Facebook Login for Business):
//   /settings/instagram → "Connect" button
//     → https://www.facebook.com/dialog/oauth?client_id=...
//     → Meta Login
//     → redirect to /api/instagram/oauth/callback?code=...&state=...
//     → this handler
//     → /settings/instagram?connected=1
//
// Required env vars:
//   INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, NEXT_PUBLIC_BASE_URL
//   INSTAGRAM_TOKEN_ENCRYPTION_KEY
//   INSTAGRAM_WEBHOOK_VERIFY_TOKEN

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { assertFeature, BillingError, billingErrorToResponse } from "@/lib/billing/guards";
import {
  exchangeForLongLivedToken,
  getIGUser,
  getPages,
  subscribePageToWebhooks,
} from "@/lib/instagram/client";
import { encryptToken } from "@/lib/instagram/token-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const code  = searchParams.get("code");
  const state = searchParams.get("state");   // workspace-scoped CSRF token (optional)
  const error = searchParams.get("error");

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "";

  // ── User denied permission ─────────────────────────────────────────────────
  if (error) {
    return NextResponse.redirect(`${baseUrl}/settings/instagram?error=denied`);
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/settings/instagram?error=missing_code`);
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  // ── Feature gate ──────────────────────────────────────────────────────────
  const workspaceId = await getUserPrimaryWorkspace(user.id);
  if (workspaceId) {
    try {
      await assertFeature(workspaceId, "instagram_dm");
    } catch (err) {
      if (err instanceof BillingError) {
        const { body } = billingErrorToResponse(err);
        return NextResponse.redirect(
          `${baseUrl}/settings/instagram?error=plan_required&message=${encodeURIComponent(body.error)}`
        );
      }
    }
  }

  try {
    // ── Exchange code → short-lived token → long-lived token ─────────────
    const appId     = process.env.INSTAGRAM_APP_ID     ?? "";
    const appSecret = process.env.INSTAGRAM_APP_SECRET ?? "";
    const redirectUri = `${baseUrl}/api/instagram/oauth/callback`;

    // Step 1: code → short-lived user access token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
      new URLSearchParams({
        client_id:     appId,
        client_secret: appSecret,
        redirect_uri:  redirectUri,
        code,
      }).toString()
    );
    const tokenData = await tokenRes.json() as { access_token?: string; error?: { message: string } };
    if (!tokenData.access_token) {
      throw new Error(tokenData.error?.message ?? "Token exchange failed");
    }

    // Step 2: short-lived → long-lived (60 days)
    const longLived = await exchangeForLongLivedToken(tokenData.access_token);
    const accessToken = longLived.access_token;
    const expiresAt = longLived.expires_in
      ? new Date(Date.now() + longLived.expires_in * 1_000)
      : null;

    // ── Resolve Instagram Business account ───────────────────────────────
    const pages = await getPages(accessToken);
    const db    = createAdminClient();

    let connectedCount = 0;

    for (const page of pages) {
      const igAccountId = page.instagram_business_account?.id;
      if (!igAccountId) continue;

      // Get Instagram username + profile info
      let igUser;
      try {
        igUser = await getIGUser(page.access_token);
      } catch {
        igUser = { id: igAccountId, username: "", followers_count: 0 };
      }

      // Subscribe page to Meta webhook events
      try {
        await subscribePageToWebhooks(page.id, page.access_token);
      } catch (err) {
        console.warn(`[ig-oauth] Failed to subscribe page ${page.id} to webhooks:`, err);
      }

      // Upsert instagram_accounts row
      const enc = encryptToken(accessToken);
      await db.from("instagram_accounts").upsert(
        {
          workspace_id:      workspaceId ?? user.id,
          user_id:           user.id,
          ig_user_id:        igAccountId,
          ig_username:       igUser.username ?? igAccountId,
          access_token_enc:  enc,
          token_expires_at:  expiresAt?.toISOString() ?? null,
          page_id:           page.id,
          page_name:         page.name,
          avatar_url:        (igUser as { profile_picture_url?: string }).profile_picture_url ?? null,
          followers_count:   (igUser as { followers_count?: number }).followers_count ?? 0,
          connection_state:  "connected",
          last_error:        null,
          last_synced_at:    new Date().toISOString(),
          is_active:         true,
        },
        { onConflict: "workspace_id,ig_user_id" }
      );

      connectedCount++;
    }

    if (connectedCount === 0) {
      return NextResponse.redirect(
        `${baseUrl}/settings/instagram?error=no_ig_account`
      );
    }

    return NextResponse.redirect(
      `${baseUrl}/settings/instagram?connected=${connectedCount}`
    );
  } catch (err) {
    console.error("[ig-oauth] OAuth callback error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.redirect(
      `${baseUrl}/settings/instagram?error=oauth_failed&message=${encodeURIComponent(msg)}`
    );
  }
}
