"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Zap, MessageSquare, Clock, Tag, User, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TriggerNodeData } from "@/types/automation";

const TRIGGER_ICONS: Record<string, React.ElementType> = {
  message_received:          MessageSquare,
  first_message:             MessageSquare,
  keyword_match:             Hash,
  conversation_created:      MessageSquare,
  conversation_status_changed: Zap,
  tag_added:                 Tag,
  tag_removed:               Tag,
  contact_created:           User,
  no_response_timeout:       Clock,
  scheduled_cron:            Clock,
  lead_score_threshold:      Zap,
  default:                   Zap,
};

const TRIGGER_LABELS: Record<string, string> = {
  message_received:          "Mensaje recibido",
  first_message:             "Primer mensaje",
  keyword_match:             "Coincidencia de palabra clave",
  conversation_created:      "Conversación creada",
  conversation_status_changed: "Cambio de estado",
  tag_added:                 "Etiqueta añadida",
  tag_removed:               "Etiqueta eliminada",
  contact_created:           "Contacto creado",
  no_response_timeout:       "Sin respuesta",
  scheduled_cron:            "Programado",
  lead_score_threshold:      "Lead score",
};

export const TriggerNode = memo(function TriggerNode({
  data,
  selected,
}: NodeProps) {
  const nodeData = data as unknown as TriggerNodeData;
  const triggerType = nodeData.config?.type ?? "message_received";
  const Icon = TRIGGER_ICONS[triggerType] ?? TRIGGER_ICONS.default!;
  const label = nodeData.label || TRIGGER_LABELS[triggerType] || "Trigger";

  return (
    <div
      className={cn(
        "min-w-[200px] rounded-2xl border-2 bg-card shadow-lg transition-all",
        selected
          ? "border-[#10b981] shadow-[0_0_0_4px_rgba(16,185,129,0.15)]"
          : "border-[#10b981]/50 hover:border-[#10b981]"
      )}
    >
      <div className="flex items-center gap-2.5 px-4 py-3 rounded-t-2xl bg-[#10b981]/10 border-b border-[#10b981]/20">
        <div className="h-7 w-7 rounded-lg bg-[#10b981] flex items-center justify-center shrink-0">
          <Icon className="h-3.5 w-3.5 text-[#030712]" />
        </div>
        <div>
          <p className="text-[10px] font-semibold text-[#10b981] uppercase tracking-wider">Inicio</p>
          <p className="text-xs font-semibold text-foreground leading-tight">{label}</p>
        </div>
      </div>

      {nodeData.config?.keyword && (
        <div className="px-4 py-2">
          <p className="text-[11px] text-muted-foreground">
            Keyword: <span className="text-foreground font-medium">&ldquo;{nodeData.config.keyword}&rdquo;</span>
          </p>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !bg-[#10b981] !border-2 !border-card"
      />
    </div>
  );
});
