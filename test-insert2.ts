import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const db = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data, error } = await db.from("workspaces").insert({
    owner_id: "e5792d77-62f9-4d2b-ad6b-67a68ed01c7a", // A random UUID
    name: "Test Workspace",
    slug: "test-workspace-1234",
    plan_id: "starter"
  }).select();
  console.log("Error:", JSON.stringify(error, null, 2));
  console.log("Data:", data);
}

main();
