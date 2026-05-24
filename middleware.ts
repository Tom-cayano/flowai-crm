import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Machine-to-machine API routes that must never be redirected to /login.
// Security for these paths is handled inside the route handler itself
// (e.g. EVOLUTION_WEBHOOK_SECRET signature verification).
const PUBLIC_API_PREFIXES = [
  "/api/webhook/",
  "/api/billing/webhooks",  // Stripe webhook — verified via signature, no session
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Short-circuit before touching Supabase — avoids a getUser() network call
  // on every webhook event and eliminates the redirect-to-login behaviour.
  if (PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match every path EXCEPT:
     *   - _next/static  (static assets)
     *   - _next/image   (image optimisation)
     *   - favicon.ico, sitemap.xml, robots.txt
     *   - Any file with an extension (e.g. .svg, .png, .js, .css)
     *
     * This ensures middleware runs on all page routes (including auth routes)
     * but not on static file requests.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf)$).*)",
  ],
};
