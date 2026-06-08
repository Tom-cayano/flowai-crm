// GET /api/instagram/oauth/start
//
// Redirects the authenticated user to the Facebook Login dialog with the
// permissions required for Instagram Business Messaging via Messenger Platform.
// After the user grants access, Meta redirects to /api/instagram/oauth/callback.
//
// ─── ARCHITECTURE ────────────────────────────────────────────────────────────
// This CRM uses: Facebook Login + Instagram Graph API (NOT Instagram Login API)
//
// Flow:
//   1. User logs in via Facebook (facebook.com/v21.0/dialog/oauth)
//   2. We call GET /me/accounts to get their Facebook Pages
//   3. Each Page exposes its linked instagram_business_account
//   4. We use the Page Access Token to send/receive Instagram DMs
//
// This is the "Instagram API with Facebook Login" product in Meta Developers.
// Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login
//
// ─── SCOPES ──────────────────────────────────────────────────────────────────
// These scopes are valid for facebook.com/dialog/oauth (Facebook Login API).
//
// ⚠️  instagram_business_* scopes are NOT valid here — they belong to:
//     api.instagram.com/oauth/authorize (Instagram Login API — different product)
//
// Required:
//   instagram_basic              — read IG profile data via the linked Page
//   instagram_manage_messages    — send/receive Instagram DMs (Messenger Platform)
//   instagram_manage_comments    — read/reply to comments
//   pages_show_list              — list Facebook Pages the user manages
//   pages_read_engagement        — read Page engagement data
//   pages_manage_metadata        — subscribe the Page to webhooks
//
// Source: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started
// (Step 2: "request these permissions: instagram_basic, pages_show_list")
// + https://developers.facebook.com/docs/messenger-platform/instagram (messaging perms)
//
// Required env vars:
//   INSTAGRAM_APP_ID (or META_APP_ID as fallback)
//   INSTAGRAM_APP_SECRET (or META_APP_SECRET as fallback)
//   NEXT_PUBLIC_BASE_URL (must be https://www.flowaicrm.com in production)

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  resolveAppId,
  resolveRedirectUri,
  checkIGConfig,
  IGConfigError,
} from "@/lib/instagram/client";

export const dynamic = "force-dynamic";

// ─── Scopes for Facebook Login + Instagram Graph API ─────────────────────────
// These are valid on https://www.facebook.com/v21.0/dialog/oauth
//
// DO NOT use instagram_business_* scopes here — those only work on:
//   https://api.instagram.com/oauth/authorize (Instagram Login API, different product)
//
const IG_SCOPES = [
  "instagram_basic",            // read IG profile linked to a Facebook Page
  "instagram_manage_messages",  // send/receive DMs via Messenger Platform
  "pages_show_list",            // list Facebook Pages the user manages
  "pages_read_engagement",      // read Page engagement metrics
  "pages_manage_metadata",      // subscribe Page to webhook events
  "pages_messaging",            // subscribe Page to receive messages webhooks
  // instagram_manage_comments removed — requires App Review approval
].join(",");

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "";

  if (!user) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  // ── Validate config before redirecting ──────────────────────────────────
  const config = checkIGConfig();
  if (!config.ok) {
    const issues = config.issues.join("; ");
    console.error("[ig-oauth] Configuration errors prevent OAuth start:", issues);
    return NextResponse.json(
      {
        error:  "Instagram OAuth is not properly configured.",
        issues: config.issues,
        hint:   "Check environment variables in Vercel → Settings → Environment Variables",
      },
      { status: 503 }
    );
  }

  try {
    const appId       = resolveAppId();
    const redirectUri = resolveRedirectUri();

    const oauthUrl =
      "https://www.facebook.com/v21.0/dialog/oauth?" +
      new URLSearchParams({
        client_id:     appId,
        redirect_uri:  redirectUri,
        scope:         IG_SCOPES,
        response_type: "code",
        state:         user.id,   // echoed back in callback for CSRF validation
      }).toString();

    console.info(
      `[ig-oauth] Redirecting to Facebook Login — appId: ${appId}, ` +
      `redirectUri: ${redirectUri}, scopes: ${IG_SCOPES}`
    );

    return NextResponse.redirect(oauthUrl);
  } catch (err) {
    if (err instanceof IGConfigError) {
      console.error("[ig-oauth] Config error:", err.message);
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
}
