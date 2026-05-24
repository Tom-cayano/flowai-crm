/**
 * Email confirmation / OTP verification handler.
 *
 * Supabase redirects here when a user clicks the link in:
 *   - Email verification (after sign-up)
 *   - Password-reset emails
 *   - Email change confirmation
 *
 * The `token_hash` + `type` params are verified with verifyOtp(), which
 * sets the session cookie, then the user is redirected appropriately.
 *
 * Configure this URL in:
 *   Supabase Dashboard → Authentication → Email Templates
 *   Set the confirmation URL to: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?error=invalid_confirmation_link`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

  if (error) {
    console.error("[auth/confirm] verifyOtp error:", error.message);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    );
  }

  const safeRedirect = next.startsWith("/") ? next : "/dashboard";

  // For password-reset type, redirect to a dedicated reset page.
  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/update-password`);
  }

  return NextResponse.redirect(`${origin}${safeRedirect}`);
}
