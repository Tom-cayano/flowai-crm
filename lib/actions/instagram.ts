"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { planHasFeature } from "@/lib/billing/plans";

type Ok<T>  = { data: T;    error: null };
type Err    = { data: null; error: string };
type Result<T> = Ok<T> | Err;

export interface IGAccountSummary {
  id:               string;
  ig_user_id:       string;
  ig_username:      string;
  avatar_url:       string | null;
  followers_count:  number;
  connection_state: string;
  page_id:          string;
  page_name:        string | null;
  last_error:       string | null;
  last_synced_at:   string | null;
  token_expires_at: string | null;
}

export async function getInstagramAccounts(): Promise<Result<IGAccountSummary[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  const workspaceId = await getUserPrimaryWorkspace(user.id);
  if (!workspaceId) return { data: [], error: null };

  const db = createAdminClient();
  const { data: ws } = await db
    .from("workspaces")
    .select("plan_id")
    .eq("id", workspaceId)
    .single();

  if (!ws || !planHasFeature(ws.plan_id, "instagram_dm")) {
    return { data: [], error: null };
  }

  const { data, error } = await db
    .from("instagram_accounts")
    .select("id, ig_user_id, ig_username, avatar_url, followers_count, connection_state, page_id, page_name, last_error, last_synced_at, token_expires_at")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as IGAccountSummary[], error: null };
}
