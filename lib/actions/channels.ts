"use server";

// Server action — returns a unified snapshot of all channel connections
// for the authenticated user's workspace. Used by /settings/channels.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";

// ─── Shape returned to the UI ─────────────────────────────────────────────────

export interface WhatsAppEvolutionAccount {
  id:           string;
  instanceName: string;
  status:       string;   // "connected" | "disconnected" | "qr_code" | ...
  phoneNumber:  string | null;
  displayName:  string | null;
  avatarUrl:    string | null;
}

export interface WhatsAppCloudAccount {
  id:                  string;
  phoneNumberId:       string;
  displayPhoneNumber:  string | null;
  verifiedName:        string | null;
  connectionState:     string;
  lastError:           string | null;
  lastSyncedAt:        string | null;
}

export interface InstagramAccount {
  id:              string;
  igUsername:      string;
  avatarUrl:       string | null;
  followersCount:  number;
  connectionState: string;
  lastError:       string | null;
  tokenExpiresAt:  string | null;
}

export interface FacebookPage {
  id:        string;
  pageId:    string;
  pageName:  string | null;
  isActive:  boolean;
  connectedAt: string;
}

export interface ChannelSummary {
  whatsappEvolution: WhatsAppEvolutionAccount[];
  whatsappCloud:     WhatsAppCloudAccount[];
  instagram:         InstagramAccount[];
  messenger:         FacebookPage[];
}

type Result<T> = { data: T; error: null } | { data: null; error: string };

// ─── Main action ──────────────────────────────────────────────────────────────

export async function getAllChannels(): Promise<Result<ChannelSummary>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Unauthorized" };

  const workspaceId = await getUserPrimaryWorkspace(user.id);
  if (!workspaceId) return { data: null, error: "No workspace found" };

  const db = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any;

  const [waEvo, waCloud, ig, fb] = await Promise.all([
    // WhatsApp via Evolution API
    db
      .from("whatsapp_instances")
      .select("id, instance_name, connection_state, phone_number, display_name, avatar_url")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),

    // WhatsApp Cloud API direct (table not yet in generated types — pending migration)
    anyDb
      .from("whatsapp_cloud_accounts")
      .select("id, phone_number_id, display_phone_number, verified_name, connection_state, last_error, last_synced_at")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),

    // Instagram
    db
      .from("instagram_accounts")
      .select("id, ig_username, avatar_url, followers_count, connection_state, last_error, token_expires_at")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),

    // Facebook Messenger pages
    db
      .from("facebook_pages")
      .select("id, page_id, page_name, is_active, connected_at")
      .eq("workspace_id", workspaceId)
      .order("connected_at", { ascending: false }),
  ]);

  return {
    data: {
      whatsappEvolution: (waEvo.data ?? []).map((r) => ({
        id:           r.id,
        instanceName: r.instance_name,
        status:       r.connection_state ?? "unknown",
        phoneNumber:  r.phone_number ?? null,
        displayName:  r.display_name ?? null,
        avatarUrl:    r.avatar_url   ?? null,
      })),

      whatsappCloud: (waCloud.data ?? []).map((r: { id: string; phone_number_id: string; display_phone_number: string | null; verified_name: string | null; connection_state: string; last_error: string | null; last_synced_at: string | null }) => ({
        id:                 r.id,
        phoneNumberId:      r.phone_number_id,
        displayPhoneNumber: r.display_phone_number ?? null,
        verifiedName:       r.verified_name        ?? null,
        connectionState:    r.connection_state,
        lastError:          r.last_error            ?? null,
        lastSyncedAt:       r.last_synced_at        ?? null,
      })),

      instagram: (ig.data ?? []).map((r) => ({
        id:              r.id,
        igUsername:      r.ig_username,
        avatarUrl:       r.avatar_url    ?? null,
        followersCount:  r.followers_count,
        connectionState: r.connection_state,
        lastError:       r.last_error        ?? null,
        tokenExpiresAt:  r.token_expires_at  ?? null,
      })),

      messenger: (fb.data ?? []).map((r) => ({
        id:          r.id,
        pageId:      r.page_id,
        pageName:    r.page_name   ?? null,
        isActive:    r.is_active,
        connectedAt: r.connected_at,
      })),
    },
    error: null,
  };
}
