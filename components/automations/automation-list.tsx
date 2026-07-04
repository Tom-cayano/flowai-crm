"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Zap, MoreHorizontal, Play, Pause, Trash2, Copy,
  ChevronRight, Activity, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  toggleAutomationStatus,
  deleteAutomation,
  duplicateAutomation,
} from "@/lib/actions/automations";
import type { AutomationRecord, AutomationStatus2 } from "@/types/automation";

const STATUS_VARIANT: Record<AutomationStatus2, "default" | "secondary" | "outline"> = {
  active:   "default",
  inactive: "secondary",
  draft:    "outline",
};

const STATUS_LABEL: Record<AutomationStatus2, string> = {
  active:   "Activo",
  inactive: "Inactivo",
  draft:    "Borrador",
};

const STATUS_COLOR: Record<AutomationStatus2, string> = {
  active:   "text-[#10b981]",
  inactive: "text-muted-foreground",
  draft:    "text-amber-400",
};

const TRIGGER_LABEL: Record<string, string> = {
  message_received:            "Mensaje recibido",
  first_message:               "Primer mensaje",
  keyword_match:               "Keyword",
  conversation_created:        "Conv. creada",
  conversation_status_changed: "Cambio de estado",
  tag_added:                   "Etiqueta añadida",
  tag_removed:                 "Etiqueta eliminada",
  contact_created:             "Contacto creado",
  no_response_timeout:         "Sin respuesta",
  scheduled_cron:              "Programado",
  lead_score_threshold:        "Lead score",
  webhook_lead:                "Webhook entrante",
  business_hours_start:        "Inicio jornada",
  business_hours_end:          "Fin jornada",
  // Instagram
  instagram_dm_received:       "IG · DM recibido",
  instagram_comment_received:  "IG · Comentario",
  instagram_story_mention:     "IG · Mención story",
  instagram_first_contact:     "IG · Primer contacto",
  instagram_lead_detected:     "IG · Lead detectado",
};

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (mins < 1)   return "ahora mismo";
  if (mins < 60)  return `hace ${mins}m`;
  if (hours < 24) return `hace ${hours}h`;
  return `hace ${days}d`;
}

function countNodes(automation: AutomationRecord): number {
  return automation.workflow?.nodes?.length ?? 0;
}

function getTriggerType(automation: AutomationRecord): string {
  const trigger = automation.workflow?.nodes?.find((n) => n.type === "trigger");
  const type = (trigger?.data as { config?: { type?: string } })?.config?.type ?? "";
  return TRIGGER_LABEL[type] ?? type ?? "Sin disparador";
}

interface AutomationCardProps {
  automation: AutomationRecord;
  onToggle: (id: string, status: AutomationStatus2) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

function AutomationCard({ automation, onToggle, onDelete, onDuplicate }: AutomationCardProps) {
  const router = useRouter();
  const isActive = automation.status === "active";
  const triggerType = getTriggerType(automation);
  const nodeCount = countNodes(automation);

  return (
    <Card
      className={cn(
        "transition-colors",
        isActive && "border-[#10b981]/20"
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "flex items-center justify-center w-10 h-10 rounded-xl shrink-0",
              isActive ? "bg-[#10b981]/10 text-[#10b981]" : "bg-muted text-muted-foreground"
            )}
          >
            <Zap className="h-5 w-5" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-foreground truncate">{automation.name}</h3>
              <Badge
                variant={STATUS_VARIANT[automation.status]}
                className={cn("text-[10px] shrink-0", STATUS_COLOR[automation.status])}
              >
                {STATUS_LABEL[automation.status]}
              </Badge>
            </div>
            {automation.description && (
              <p className="text-xs text-muted-foreground mb-3 line-clamp-1">{automation.description}</p>
            )}

            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] text-foreground">
                <Activity className="h-3 w-3 text-[#10b981]" />
                <span>{triggerType}</span>
              </div>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <div className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] text-foreground">
                <Zap className="h-3 w-3 text-amber-400" />
                <span>{nodeCount} {nodeCount !== 1 ? "nodos" : "nodo"}</span>
              </div>
            </div>

            <div className="flex items-center gap-4 mt-3">
              <div>
                <p className="text-[10px] text-muted-foreground">Ejecuciones</p>
                <p className="text-xs font-semibold text-foreground tabular-nums">
                  {(automation.executionCount ?? 0).toLocaleString("es-ES")}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Último disparo</p>
                <p className="text-xs font-semibold text-foreground">
                  {formatRelative(automation.lastTriggeredAt)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Actualizado</p>
                <p className="text-xs font-semibold text-foreground">
                  {formatRelative(automation.updatedAt)}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {automation.status !== "draft" && (
              <Switch
                checked={isActive}
                onCheckedChange={() =>
                  onToggle(automation.id, isActive ? "inactive" : "active")
                }
              />
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => router.push(`/automations/${automation.id}`)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-xs"
                  onClick={() => router.push(`/automations/${automation.id}`)}
                >
                  <Pencil className="mr-2 h-3.5 w-3.5" />Editar flujo
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs" onClick={() => onDuplicate(automation.id)}>
                  <Copy className="mr-2 h-3.5 w-3.5" />Duplicar
                </DropdownMenuItem>
                {automation.status === "active" && (
                  <DropdownMenuItem
                    className="text-xs"
                    onClick={() => onToggle(automation.id, "inactive")}
                  >
                    <Pause className="mr-2 h-3.5 w-3.5" />Pausar
                  </DropdownMenuItem>
                )}
                {automation.status === "inactive" && (
                  <DropdownMenuItem
                    className="text-xs"
                    onClick={() => onToggle(automation.id, "active")}
                  >
                    <Play className="mr-2 h-3.5 w-3.5" />Activar
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-xs text-destructive focus:text-destructive focus:bg-destructive/10"
                  onClick={() => onDelete(automation.id)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface Props {
  initialAutomations: AutomationRecord[];
}

export function AutomationList({ initialAutomations }: Props) {
  const router = useRouter();
  const [automations, setAutomations] = useState(initialAutomations);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleToggle = (id: string, status: AutomationStatus2) => {
    setAutomations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status } : a))
    );
    startTransition(async () => {
      await toggleAutomationStatus(id, status);
    });
  };

  const handleDelete = (id: string) => setDeleteTarget(id);

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const id = deleteTarget;
    setDeleteTarget(null);
    setAutomations((prev) => prev.filter((a) => a.id !== id));
    startTransition(async () => {
      await deleteAutomation(id);
    });
  };

  const handleDuplicate = (id: string) => {
    startTransition(async () => {
      const result = await duplicateAutomation(id);
      if (result.data) {
        setAutomations((prev) => [result.data!, ...prev]);
      }
    });
  };

  const activeCount = automations.filter((a) => a.status === "active").length;
  const totalExecutions = automations.reduce((sum, a) => sum + (a.executionCount ?? 0), 0);

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Activas</p>
                <p className="text-lg font-bold text-[#10b981] tabular-nums">{activeCount}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ejecuciones</p>
                <p className="text-lg font-bold text-foreground tabular-nums">
                  {totalExecutions.toLocaleString("es-ES")}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Flujos</p>
                <p className="text-lg font-bold text-foreground tabular-nums">{automations.length}</p>
              </div>
            </div>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => router.push("/automations/new")}
            >
              <Zap className="h-3.5 w-3.5" />
              Nueva automatización
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 p-6">
          <div className="space-y-3 max-w-screen-xl">
            {automations.length === 0 && (
              <div className="text-center py-16">
                <Zap className="h-10 w-10 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-sm font-medium text-muted-foreground">Sin automatizaciones</p>
                <p className="text-xs text-muted-foreground mt-1">Crea tu primera automatización para comenzar</p>
                <Button
                  size="sm"
                  className="mt-4 gap-1.5 text-xs"
                  onClick={() => router.push("/automations/new")}
                >
                  <Zap className="h-3.5 w-3.5" />
                  Crear automatización
                </Button>
              </div>
            )}
            {automations.map((automation) => (
              <AutomationCard
                key={automation.id}
                automation={automation}
                onToggle={handleToggle}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v: boolean) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar automatización?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El historial de ejecuciones también se eliminará.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
