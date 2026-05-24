/**
 * OAuth & magic-link callback handler.
 *
 * Supabase redirects here after:
 *   - Google / GitHub OAuth sign-in
 *   - Magic link (passwordless) sign-in
 *
 * The `code` query param is exchanged for a session cookie, then the user
 * is redirected to their intended destination (or /dashboard by default).
 *
 * Configure this URL in:
 *   Supabase Dashboard → Authentication → URL Configuration → Redirect URLs
 *   Add: http://localhost:3000/auth/callback  (dev)
 *        https://your-domain.com/auth/callback  (prod)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const redirectTo = searchParams.get("redirectTo") ?? next;

  if (!code) {
    // No code param — something went wrong upstream.
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession error:", error.message);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    );
  }

  // Redirect to the page the user originally tried to visit.
  // Ensure we stay on the same origin to prevent open redirects.
  const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/dashboard";
  return NextResponse.redirect(`${origin}${safeRedirect}`);
}
