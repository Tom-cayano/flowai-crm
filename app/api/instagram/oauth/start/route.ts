// GET /api/instagram/oauth/start
//
// Redirects the authenticated user to the Facebook Login dialog with the
// permissions required for Instagram Business Messaging.
// After the user grants access, Meta redirects to /api/instagram/oauth/callback.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const IG_SCOPES = [
  "instagram_basic",
  "instagram_manage_messages",
  "instagram_manage_comments",
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "business_management",
].join(",");

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "";

  if (!user) {
    return NextResponse.redirect(`${baseUrl}/login`);
  }

  const appId       = process.env.INSTAGRAM_APP_ID ?? "";
  const redirectUri = `${baseUrl}/api/instagram/oauth/callback`;

  const oauthUrl =
    "https://www.facebook.com/v21.0/dialog/oauth?" +
    new URLSearchParams({
      client_id:     appId,
      redirect_uri:  redirectUri,
      scope:         IG_SCOPES,
      response_type: "code",
      state:         user.id,
    }).toString();

  return NextResponse.redirect(oauthUrl);
}
