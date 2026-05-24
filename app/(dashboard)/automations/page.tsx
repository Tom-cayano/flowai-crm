import { getAutomations } from "@/lib/actions/automations";
import { AutomationList } from "@/components/automations/automation-list";

export const dynamic = "force-dynamic";

export default async function AutomationsPage() {
  const result = await getAutomations();
  const automations = result.data ?? [];

  return <AutomationList initialAutomations={automations} />;
}
