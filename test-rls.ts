import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminDb = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  // Create a dummy user
  const email = "test-rls-" + Date.now() + "@example.com";
  const { data: userResp, error: userErr } = await adminDb.auth.admin.createUser({
    email,
    password: "Password123!",
    email_confirm: true,
  });

  if (userErr) {
    console.error("Failed to create user:", userErr);
    return;
  }
  const userId = userResp.user.id;

  // Sign in as that user
  const userDb = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: authData, error: authErr } = await userDb.auth.signInWithPassword({
    email,
    password: "Password123!",
  });

  if (authErr) {
    console.error("SignIn error:", authErr);
    return;
  }

  console.log("Logged in as:", authData.user.id);

  // Try to insert a workspace
  const { data: wsData, error: wsErr } = await userDb
    .from("workspaces")
    .insert({
      owner_id: userId,
      name: "Test RLS Workspace",
      slug: "test-rls-" + Date.now(),
      plan_id: "starter"
    })
    .select()
    .single();

  console.log("Insert Workspace Error:", JSON.stringify(wsErr, null, 2));
  console.log("Insert Workspace Data:", wsData);

  // Cleanup
  await adminDb.auth.admin.deleteUser(userId);
}

main();
