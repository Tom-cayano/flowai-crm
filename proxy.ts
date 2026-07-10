/**
 * FlowAI CRM — Next.js Middleware
 *
 * Responsabilidades:
 *  1. Refrescar la sesión de Supabase en cada request (crítico para SSR).
 *  2. Proteger las rutas del dashboard — redirige a /login si no hay sesión.
 *  3. Redirigir a /dashboard si un usuario ya logueado visita /login o /signup.
 *  4. Dejar pasar libremente: API routes públicas, assets estáticos y webhooks.
 *
 * IMPORTANTE: No eliminar el bloque `supabase.auth.getUser()` aunque no uses
 * el resultado — es la llamada que refresca el token y escribe las cookies.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rutas que NO requieren autenticación
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/forgot-password",
  "/update-password",
  "/auth/callback",
  "/auth/confirm",
  // Marketing / landing
  "/",
  "/pricing",
];

// Prefijos que siempre se dejan pasar (APIs públicas, webhooks, assets)
const BYPASS_PREFIXES = [
  "/api/webhook/",       // Evolution API, Meta, etc. — no tienen sesión
  "/api/webhooks/",      // Webhook universal de integraciones — usa Bearer token
  "/api/billing/webhooks", // Stripe webhook — usa firma, no sesión
  "/api/sales/",         // puente del asistente comercial — usa secreto compartido
  "/api/ops",            // health checks internos
  "/_next/",
  "/favicon",
  "/icon",
];

function isPublic(pathname: string): boolean {
  if (BYPASS_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // Archivos estáticos con extensión
  if (/\.\w+$/.test(pathname)) return true;
  return false;
}

function isAuthPage(pathname: string): boolean {
  return ["/login", "/signup", "/forgot-password"].includes(pathname);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Crear respuesta base que pasará las cookies actualizadas
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
          // Escribir cookies en la request y en la respuesta
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

  // ⚠️ CRÍTICO: esta llamada refresca el token — no mover ni eliminar
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Rutas siempre permitidas ─────────────────────────────────────────────
  if (isPublic(pathname)) {
    // Si el usuario YA está logueado y va a /login o /signup → dashboard
    if (user && isAuthPage(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // ── Rutas protegidas — requieren sesión ──────────────────────────────────
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Guardar destino para redirigir después del login
    if (pathname !== "/dashboard") {
      url.searchParams.set("redirectTo", pathname);
    }
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Aplicar a todas las rutas EXCEPTO:
     * - _next/static  (assets compilados)
     * - _next/image   (optimización de imágenes)
     * - favicon.ico, icon.svg
     * - Archivos con extensión (png, jpg, svg, webp, woff2…)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|otf|ico)$).*)",
  ],
};
