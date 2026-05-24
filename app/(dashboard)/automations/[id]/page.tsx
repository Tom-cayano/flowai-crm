import { notFound } from "next/navigation";
import { getAutomation } from "@/lib/actions/automations";
import { AutomationEditorShell } from "@/components/automations/automation-editor-shell";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AutomationEditorPage({ params }: Props) {
  const { id } = await params;
  const result = await getAutomation(id);

  if (!result.data) notFound();

  return <AutomationEditorShell automation={result.data} />;
}
