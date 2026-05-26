import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

async function main() {
  const { data, error } = await db.rpc('get_authorized_workspaces'); // just a test
  // To get policies, we must query pg_policies using postgres connection.
  // Actually, we can use the Supabase postgres connection.
}
