import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { env } from "@/lib/env";
import { WhatsAppCloudClient } from "./whatsapp-cloud-client";

export const dynamic = "force-dynamic";

export interface WACAccount {
  id:                  string;
  wabaId:              string;
  phoneNumberId:       string;
  displayPhoneNumber:  string | null;
  verifiedName:        string | null;
  connectionState:     string;
  lastError:           string | null;
  lastSyncedAt:        string | null;
  isActive:            boolean;
  createdAt:           string;
}

export default async function WhatsAppIntegrationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspaceId = await getUserPrimaryWorkspace(user.id);
  if (!workspaceId) redirect("/onboarding");

  const db = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: raw } = await (db as any)
    .from("whatsapp_cloud_accounts")
    .select("id, waba_id, phone_number_id, display_phone_number, verified_name, connection_state, last_error, last_synced_at, is_active, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false }) as {
      data: Array<{
        id: string; waba_id: string; phone_number_id: string;
        display_phone_number: string | null; verified_name: string | null;
        connection_state: string; last_error: string | null;
        last_synced_at: string | null; is_active: boolean; created_at: string;
      }> | null
    };

  const accounts: WACAccount[] = (raw ?? []).map((r) => ({
    id:                  r.id,
    wabaId:              r.waba_id,
    phoneNumberId:       r.phone_number_id,
    displayPhoneNumber:  r.display_phone_number,
    verifiedName:        r.verified_name,
    connectionState:     r.connection_state,
    lastError:           r.last_error,
    lastSyncedAt:        r.last_synced_at,
    isActive:            r.is_active,
    createdAt:           r.created_at,
  }));

  const webhookUrl  = `${env.app.baseUrl()}/api/webhook/meta`;
  const metaReady   = env.meta.isConfigured();

  return (
    <WhatsAppCloudClient
      accounts={accounts}
      webhookUrl={webhookUrl}
      metaReady={metaReady}
    />
  );
}
