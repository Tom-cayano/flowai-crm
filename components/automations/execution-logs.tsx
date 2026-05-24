"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, CheckCircle2, XCircle, Clock, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getExecutionLogs } from "@/lib/actions/automations";

interface LogEntry {
  nodeId: string;
  nodeType: string;
  level: string;
  message: string;
  createdAt: string;
}

interface Execution {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  conversationId: string | null;
  logs: LogEntry[];
}

function formatTs(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5 text-[#10b981] shrink-0" />;
  if (status === "failed")    return <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />;
  if (status === "running")   return <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin shrink-0" />;
  return <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
}

function LogLevelDot({ level }: { level: string }) {
  return (
    <span
      className={cn(
        "inline-block h-1.5 w-1.5 rounded-full shrink-0 mt-1.5",
        level === "error" && "bg-destructive",
        level === "warn"  && "bg-amber-400",
        level === "info"  && "bg-blue-400",
        level === "debug" && "bg-muted-foreground"
      )}
    />
  );
}

function ExecutionRow({ execution }: { execution: Execution }) {
  const [open, setOpen] = useState(false);

  const duration =
    execution.completedAt
      ? Math.round((new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()) / 1000)
      : null;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
      >
        <StatusIcon status={execution.status} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">{formatDate(execution.startedAt)}</span>
            {duration !== null && (
              <span className="text-[10px] text-muted-foreground">{duration}s</span>
            )}
          </div>
          {execution.error && (
            <p className="text-[10px] text-destructive truncate mt-0.5">{execution.error}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={cn(
            "text-[10px] font-semibold uppercase tracking-wider",
            execution.status === "completed" && "text-[#10b981]",
            execution.status === "failed"    && "text-destructive",
            execution.status === "running"   && "text-blue-400",
          )}>
            {execution.status === "completed" && "Completado"}
            {execution.status === "failed"    && "Fallido"}
            {execution.status === "running"   && "Ejecutando"}
            {execution.status === "cancelled" && "Cancelado"}
          </span>
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border bg-muted/30 px-4 py-3 space-y-1.5">
          {execution.logs.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Sin registros</p>
          )}
          {execution.logs.map((log, i) => (
            <div key={i} className="flex items-start gap-2">
              <LogLevelDot level={log.level} />
              <div className="min-w-0">
                <span className="text-[10px] text-muted-foreground font-mono">{formatTs(log.createdAt)} </span>
                <span className="text-[10px] text-muted-foreground">[{log.nodeType}] </span>
                <span className="text-[11px] text-foreground">{log.message}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  automationId: string;
}

export function ExecutionLogs({ automationId }: Props) {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      setIsLoading(true);
      const result = await getExecutionLogs(automationId, 20);
      if (result.data) setExecutions(result.data.executions);
      setIsLoading(false);
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automationId]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <p className="text-sm font-semibold text-foreground">Historial de ejecuciones</p>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load} disabled={isPending}>
          <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && executions.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">Sin ejecuciones aún</p>
              <p className="text-xs text-muted-foreground mt-1">Las ejecuciones aparecerán aquí cuando se active el flujo</p>
            </div>
          )}
          {!isLoading && executions.map((exec) => (
            <ExecutionRow key={exec.id} execution={exec} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
