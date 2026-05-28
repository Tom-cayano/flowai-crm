/**
 * FlowAI CRM — Next.js Middleware
 *
 * 1. Refresh Supabase session on every request (required for SSR).
 * 2. Protect dashboard routes — redirect to /login if no session.
 * 3. Redirect to /dashboard if an authenticated user visits /login or /signup.
 * 4. Bypass public APIs, webhooks, and static assets freely.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/update-password",
  "/auth/callback",
  "/auth/confirm",
  "/",
  "/pricing",
];

const BYPASS_PREFIXES = [
  "/api/webhook/",
  "/api/billing/webhooks",
  "/api/ops",
  "/_next/",
  "/favicon",
  "/icon",
];

function isPublic(pathname: string): boolean {
  if (BYPASS_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (/\.\w+$/.test(pathname)) return true;
  return false;
}

function isAuthPage(pathname: string): boolean {
  return ["/login", "/signup", "/forgot-password"].includes(pathname);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isPublic(pathname)) {
    if (user && isAuthPage(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (pathname !== "/dashboard") {
      url.searchParams.set("redirectTo", pathname);
    }
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|otf|ico)$).*)",
  ],
};
