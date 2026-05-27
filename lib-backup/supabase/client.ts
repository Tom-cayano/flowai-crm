/**
 * Browser (client-side) Supabase client.
 *
 * Use this inside Client Components ("use client").
 * It reads NEXT_PUBLIC_* env vars — never put the service role key here.
 *
 * Usage:
 *   "use client"
 *   import { createClient } from "@/lib/supabase/client"
 *
 *   const supabase = createClient()
 *   const { data } = await supabase.from("contacts").select()
 */

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
