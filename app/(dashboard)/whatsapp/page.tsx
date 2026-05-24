import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getInstances } from "@/lib/actions/whatsapp-instances";
import { InstanceManager } from "@/components/whatsapp/instance-manager";

export const metadata = {
  title: "WhatsApp — FlowAI CRM",
};

export default async function WhatsAppPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const result = await getInstances();
  const instances = result.data ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-foreground">WhatsApp</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gestiona tus conexiones de WhatsApp
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <InstanceManager initialInstances={instances} />
        </div>
      </div>
    </div>
  );
}
