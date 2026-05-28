import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const db = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data, error } = await db.from("workspaces").insert({
    owner_id: "00000000-0000-0000-0000-000000000000",
    name: "Test Workspace",
    slug: "test-workspace-1234",
    plan_id: "starter"
  });
  console.log("Error:", error);
  console.log("Data:", data);
}

main();
