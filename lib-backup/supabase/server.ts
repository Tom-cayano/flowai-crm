/**
 * Server-side Supabase client.
 *
 * Use this in:
 *   - Server Components (read-only — cookie writes are handled by middleware)
 *   - Route Handlers  (app/api/[...]/route.ts)
 *   - Server Actions  ("use server")
 *
 * This client reads/writes cookies through next/headers so it always has the
 * authenticated user's session. Call `await createClient()` — cookies() is
 * async in Next.js 16.
 *
 * Usage:
 *   import { createClient } from "@/lib/supabase/server"
 *
 *   const supabase = await createClient()
 *   const { data: { user } } = await supabase.auth.getUser()
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

export async function createClient() {
  // cookies() is async in Next.js 15+ / 16
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll is called from a Server Component during rendering.
            // Cookies cannot be written at render time — the middleware
            // `updateSession` call handles session refresh instead.
          }
        },
      },
    }
  );
}
