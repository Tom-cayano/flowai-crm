// GET /api/instagram/health
//
// Instagram OAuth configuration health check endpoint.
// Returns a JSON report of all required environment variables and their status.
//
// Usage:
//   curl https://www.flowaicrm.com/api/instagram/health
//
// Response:
//   {
//     "ok": true | false,
//     "appId": "1559485422278663" | null,
//     "redirectUri": "https://www.flowaicrm.com/api/instagram/oauth/callback",
//     "scopes": ["instagram_business_basic", ...],
//     "issues": [],       // blocking problems — OAuth WILL fail
//     "warnings": [],     // non-blocking — features may degrade
//     "oauthStartUrl": "https://www.facebook.com/v21.0/dialog/oauth?..."
//   }
//
// This endpoint is AUTH-PROTECTED — requires a valid session.
// Never exposes secrets — only presence/validity signals.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkIGConfig } from "@/lib/instagram/client";

export const dynamic = "force-dynamic";

// Scopes valid on facebook.com/dialog/oauth for Facebook Login + Instagram Graph API
// ⚠️  instagram_business_* scopes belong to api.instagram.com (Instagram Login API) — NOT valid here
const IG_SCOPES = [
  "instagram_basic",
  "instagram_manage_messages",
  "instagram_manage_comments",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
];

export async function GET(): Promise<NextResponse> {
  // Auth required — this endpoint reveals config info
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = checkIGConfig();

  // Build the OAuth start URL for quick testing (only if config is ok)
  let oauthStartUrl: string | null = null;
  if (config.ok && config.appId && config.redirectUri) {
    oauthStartUrl =
      "https://www.facebook.com/v21.0/dialog/oauth?" +
      new URLSearchParams({
        client_id:     config.appId,
        redirect_uri:  config.redirectUri,
        scope:         IG_SCOPES.join(","),
        response_type: "code",
        state:         user.id,
      }).toString();
  }

  return NextResponse.json(
    {
      ok:           config.ok,
      appId:        config.appId,
      redirectUri:  config.redirectUri,
      scopes:       IG_SCOPES,
      issues:       config.issues,
      warnings:     config.warnings,
      oauthStartUrl,
      // Meta Dashboard checklist
      metaDashboardChecklist: [
        "App ID matches INSTAGRAM_APP_ID in environment variables",
        `Redirect URI registered: ${config.redirectUri ?? "(unknown — NEXT_PUBLIC_BASE_URL missing)"}`,
        "Permissions added: instagram_business_basic, instagram_business_manage_messages, instagram_business_manage_comments, pages_show_list, pages_read_engagement, pages_manage_metadata",
        "Webhook subscribed to: messages, messaging_reads, comments, mentions",
        `Webhook verify token matches INSTAGRAM_WEBHOOK_VERIFY_TOKEN env var`,
        "App in Live Mode (not Development Mode) for production use",
        "Instagram Business account linked to a Facebook Page",
      ],
    },
    {
      status: config.ok ? 200 : 503,
    }
  );
}
