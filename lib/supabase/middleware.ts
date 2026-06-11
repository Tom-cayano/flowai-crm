/**
 * Supabase middleware helper — session refresh.
 *
 * Called by the root middleware.ts on every request. It:
 *   1. Reads the current auth cookies from the incoming request.
 *   2. Calls supabase.auth.getUser() which silently refreshes an expired
 *      token and writes the new cookies into the response.
 *   3. Returns the (possibly mutated) NextResponse so the updated cookies
 *      reach the browser and downstream Server Components.
 *
 * Why not do this in Server Components?
 *   Server Components can read cookies but cannot write them — only Route
 *   Handlers, Server Actions, and middleware can set cookies. Without this
 *   middleware call, tokens would expire and users would be silently logged out.
 */

import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/types/supabase";

// ─── Route classification ─────────────────────────────────────────────────────
//
// PUBLIC_ROUTES  — no session required; unauthenticated users may visit freely.
//                  NOTE: /api/webhook/* never reaches this file at all — it is
//                  intercepted in middleware.ts before updateSession() is called.
//
// AUTH_ROUTES    — only for unauthenticated users; logged-in users are sent to
//                  the dashboard.

/** Page routes that do not require a session. */
const PUBLIC_ROUTES = ["/login", "/signup", "/auth", "/", "/pricing", "/forgot-password", "/update-password"];

/** Page routes that redirect to /dashboard when the user is already logged in. */
const AUTH_ROUTES = ["/login", "/signup"];

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  // Start with a plain pass-through response; we'll replace it if cookies change.
  let supabaseResponse = NextResponse.next({ request });

  // Guard: if env vars aren't configured yet, skip auth checks entirely.
  // This lets the app work in development before Supabase is connected.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Mirror the cookies onto the request object first …
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // … then rebuild the response so the updated cookies are forwarded.
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do not run any logic between createServerClient and getUser().
  // Any await in between can invalidate the session refresh mechanism.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  // Redirect unauthenticated users away from protected routes.
  if (!user && !isPublicRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    // Preserve the intended destination so we can redirect after login.
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect already-authenticated users away from login/signup.
  if (user && AUTH_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  // IMPORTANT: return supabaseResponse, not NextResponse.next().
  // supabaseResponse holds the refreshed session cookies — losing it means
  // the browser never receives the updated token and the user is logged out.
  return supabaseResponse;
}
