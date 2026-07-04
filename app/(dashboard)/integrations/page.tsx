import { createClient } from "@/lib/supabase/server";
import { IntegrationsPanel } from "@/components/integrations/integrations-panel";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: integrations } = user
    ? await supabase
        .from("webhook_integrations")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const webhookUrl = `${appUrl}/api/webhooks/leads`;

  return (
    <IntegrationsPanel
      initialIntegrations={integrations ?? []}
      webhookUrl={webhookUrl}
    />
  );
}
