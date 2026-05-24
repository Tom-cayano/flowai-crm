"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Play, Pause, Loader2, History, Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { WorkflowBuilder } from "./workflow-builder";
import { ExecutionLogs } from "./execution-logs";
import { toggleAutomationStatus } from "@/lib/actions/automations";
import type { AutomationRecord, AutomationStatus2 } from "@/types/automation";

const STATUS_COLOR: Record<AutomationStatus2, string> = {
  active:   "text-[#10b981]",
  inactive: "text-muted-foreground",
  draft:    "text-amber-400",
};

const STATUS_LABEL: Record<AutomationStatus2, string> = {
  active:   "Activo",
  inactive: "Inactivo",
  draft:    "Borrador",
};

type Tab = "builder" | "logs";

interface Props {
  automation: AutomationRecord;
}

export function AutomationEditorShell({ automation: initial }: Props) {
  const router = useRouter();
  const [automation, setAutomation] = useState(initial);
  const [tab, setTab] = useState<Tab>("builder");
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    const next: AutomationStatus2 = automation.status === "active" ? "inactive" : "active";
    setAutomation((prev) => ({ ...prev, status: next }));
    startTransition(async () => {
      await toggleAutomationStatus(automation.id, next);
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => router.push("/automations")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-foreground truncate">{automation.name}</h1>
            <Badge
              variant="outline"
              className={cn("text-[10px] shrink-0", STATUS_COLOR[automation.status])}
            >
              {STATUS_LABEL[automation.status]}
            </Badge>
          </div>
          {automation.description && (
            <p className="text-[11px] text-muted-foreground truncate">{automation.description}</p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <button
            onClick={() => setTab("builder")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all",
              tab === "builder"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Workflow className="h-3 w-3" />
            Editor
          </button>
          <button
            onClick={() => setTab("logs")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all",
              tab === "logs"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <History className="h-3 w-3" />
            Historial
          </button>
        </div>

        {/* Toggle active */}
        <Button
          size="sm"
          variant={automation.status === "active" ? "outline" : "default"}
          className="h-7 gap-1.5 text-xs shrink-0"
          onClick={handleToggle}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : automation.status === "active" ? (
            <Pause className="h-3 w-3" />
          ) : (
            <Play className="h-3 w-3" />
          )}
          {automation.status === "active" ? "Pausar" : "Activar"}
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === "builder" && (
          <WorkflowBuilder
            automationId={automation.id}
            initialWorkflow={automation.workflow}
          />
        )}
        {tab === "logs" && (
          <ExecutionLogs automationId={automation.id} />
        )}
      </div>
    </div>
  );
}
