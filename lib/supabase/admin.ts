/**
 * Supabase admin client — service role.
 *
 * ⚠️  SERVER-ONLY. Never import this from a Client Component or expose it
 *     to the browser. The service role key bypasses Row Level Security.
 *
 * Use this only for privileged server-side operations:
 *   - Creating users programmatically
 *   - Batch data operations
 *   - Webhook handlers that need elevated access
 *
 * Usage (inside a Route Handler or Server Action):
 *   import { createAdminClient } from "@/lib/supabase/admin"
 *
 *   const supabase = createAdminClient()
 *   const { data } = await supabase.auth.admin.listUsers()
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Check your .env.local file."
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      // Node.js 20 doesn't have native WebSocket — use the ws package.
      // Node.js 22+ has native WebSocket and doesn't need this.
      ...(typeof globalThis.WebSocket === "undefined"
        ? { transport: require("ws") }
        : {}),
    },
  });
}
