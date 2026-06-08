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
//   INSTAGRAM_APP_ID (or META_APP_ID)
//   INSTAGRAM_APP_SECRET (or META_APP_SECRET)
//   NEXT_PUBLIC_BASE_URL
//   INSTAGRAM_TOKEN_ENCRYPTION_KEY
//   INSTAGRAM_WEBHOOK_VERIFY_TOKEN
//
// Scopes required (valid from Jan 27 2025):
//   instagram_business_basic
//   instagram_business_manage_messages
//   instagram_business_manage_comments
//   pages_show_list
//   pages_read_engagement
//   pages_manage_metadata

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
  resolveAppId,
  resolveAppSecret,
  resolveRedirectUri,
  IGConfigError,
} from "@/lib/instagram/client";
import { encryptToken } from "@/lib/instagram/token-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const code  = searchParams.get("code");
  const state = searchParams.get("state");   // user.id sent in state param
  const error = searchParams.get("error");

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "";

  // ── User denied permission ─────────────────────────────────────────────────
  if (error) {
    console.warn("[ig-oauth] User denied permission:", searchParams.get("error_description"));
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

  // Validate state matches the user who initiated OAuth
  if (state && state !== user.id) {
    console.warn("[ig-oauth] State mismatch — possible CSRF. state:", state, "user:", user.id);
    return NextResponse.redirect(`${baseUrl}/settings/instagram?error=state_mismatch`);
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
    // ── Validate config before making any API calls ───────────────────────
    const appId      = resolveAppId();
    const appSecret  = resolveAppSecret();
    const redirectUri = resolveRedirectUri();

    console.info("[ig-oauth] Starting callback — appId:", appId, "redirectUri:", redirectUri);

    // ── Step 1: code → short-lived user access token ──────────────────────
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
      new URLSearchParams({
        client_id:     appId,
        client_secret: appSecret,
        redirect_uri:  redirectUri,
        code,
      }).toString()
    );
    const tokenData = await tokenRes.json() as { access_token?: string; error?: { message: string; code?: number } };

    if (!tokenData.access_token) {
      const msg = tokenData.error?.message ?? "Token exchange failed (no access_token in response)";
      const code_ = tokenData.error?.code;
      console.error("[ig-oauth] Token exchange failed:", msg, "code:", code_);
      throw new Error(msg);
    }

    console.info("[ig-oauth] Short-lived token obtained — exchanging for long-lived token");

    // ── Step 2: short-lived → long-lived (60 days) ────────────────────────
    const longLived = await exchangeForLongLivedToken(tokenData.access_token);
    const accessToken = longLived.access_token;
    const expiresAt = longLived.expires_in
      ? new Date(Date.now() + longLived.expires_in * 1_000)
      : null;

    console.info("[ig-oauth] Long-lived token obtained — fetching pages");

    // ── Resolve Instagram Business account ───────────────────────────────
    const pages = await getPages(accessToken);
    console.info(`[ig-oauth] Found ${pages.length} pages`);

    const db    = createAdminClient();

    let connectedCount = 0;

    for (const page of pages) {
      const igAccountId = page.instagram_business_account?.id;
      if (!igAccountId) {
        console.info(`[ig-oauth] Page ${page.id} (${page.name}) has no Instagram Business account — skipping`);
        continue;
      }

      console.info(`[ig-oauth] Connecting Instagram account ${igAccountId} via page ${page.id} (${page.name})`);

      // Get Instagram username + profile info
      let igUser;
      try {
        igUser = await getIGUser(page.access_token);
      } catch (err) {
        console.warn(`[ig-oauth] Could not fetch IG user for page ${page.id}:`, err instanceof Error ? err.message : err);
        igUser = { id: igAccountId, username: "", followers_count: 0 };
      }

      // Subscribe page to Meta webhook events
      try {
        await subscribePageToWebhooks(page.id, page.access_token);
        console.info(`[ig-oauth] Page ${page.id} subscribed to webhooks`);
      } catch (err) {
        console.warn(`[ig-oauth] Failed to subscribe page ${page.id} to webhooks:`, err instanceof Error ? err.message : err);
      }

      // Persist page access token for Messenger (same encryption key as IG tokens)
      try {
        const pageTokenEnc = encryptToken(page.access_token);
        await db.from("facebook_pages").upsert(
          {
            workspace_id:          workspaceId ?? user.id,
            user_id:               user.id,
            page_id:               page.id,
            page_name:             page.name,
            page_access_token_enc: pageTokenEnc,
            is_active:             true,
            updated_at:            new Date().toISOString(),
          },
          { onConflict: "workspace_id,page_id" }
        );
      } catch (err) {
        // Non-fatal — Messenger will fall back to FACEBOOK_PAGE_ACCESS_TOKEN env var
        console.warn(`[ig-oauth] Failed to upsert facebook_pages for page ${page.id}:`, err instanceof Error ? err.message : err);
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

      console.info(`[ig-oauth] ✅ Instagram account ${igAccountId} (@${igUser.username}) connected`);
      connectedCount++;
    }

    if (connectedCount === 0) {
      console.warn("[ig-oauth] No Instagram Business accounts found on any authorized page");
      return NextResponse.redirect(
        `${baseUrl}/settings/instagram?error=no_ig_account`
      );
    }

    console.info(`[ig-oauth] OAuth complete — ${connectedCount} account(s) connected`);

    return NextResponse.redirect(
      `${baseUrl}/settings/instagram?connected=${connectedCount}`
    );
  } catch (err) {
    const isConfigError = err instanceof IGConfigError;
    console.error("[ig-oauth] OAuth callback error:", err instanceof Error ? err.message : err);
    const msg = err instanceof Error ? err.message : "Unknown error";

    if (isConfigError) {
      // Config errors should be loud — they indicate a deployment problem
      console.error("[ig-oauth] FATAL CONFIG ERROR:", msg);
    }

    return NextResponse.redirect(
      `${baseUrl}/settings/instagram?error=oauth_failed&message=${encodeURIComponent(msg)}`
    );
  }
}
