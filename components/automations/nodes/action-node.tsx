"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Send, UserCheck, Tag, RefreshCw, StickyNote,
  Bot, Brain, TrendingUp, Webhook, UserX, Square,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActionNodeData, ActionType } from "@/types/automation";

const ACTION_ICONS: Record<ActionType, React.ElementType> = {
  send_message:          Send,
  send_template:         Send,
  assign_agent:          UserCheck,
  unassign_agent:        UserX,
  add_tag:               Tag,
  remove_tag:            Tag,
  update_status:         RefreshCw,
  add_internal_note:     StickyNote,
  wait_delay:            Clock,
  ai_reply:              Bot,
  sales_assistant:       Bot,
  send_email:            Send,
  ai_classify_intent:    Brain,
  update_lead_score:     TrendingUp,
  add_to_segment:        UserCheck,
  remove_from_segment:   UserX,
  send_webhook:          Webhook,
  human_handoff:           UserCheck,
  end_workflow:            Square,
  send_instagram_dm:       Send,
  reply_instagram_comment: Send,
  assign_instagram_lead:   UserCheck,
  add_instagram_tag:       Tag,
  escalate_to_whatsapp:    RefreshCw,
  send_messenger_message:  Send,
};

const ACTION_COLORS: Record<ActionType, { border: string; bg: string; icon: string; label: string }> = {
  send_message:        { border: "border-blue-500/50 hover:border-blue-500",      bg: "bg-blue-500/10 border-b border-blue-500/20",    icon: "bg-blue-500",    label: "text-blue-400" },
  send_template:       { border: "border-blue-500/50 hover:border-blue-500",      bg: "bg-blue-500/10 border-b border-blue-500/20",    icon: "bg-blue-500",    label: "text-blue-400" },
  assign_agent:        { border: "border-violet-500/50 hover:border-violet-500",  bg: "bg-violet-500/10 border-b border-violet-500/20", icon: "bg-violet-500",  label: "text-violet-400" },
  unassign_agent:      { border: "border-violet-500/50 hover:border-violet-500",  bg: "bg-violet-500/10 border-b border-violet-500/20", icon: "bg-violet-500",  label: "text-violet-400" },
  add_tag:             { border: "border-cyan-500/50 hover:border-cyan-500",      bg: "bg-cyan-500/10 border-b border-cyan-500/20",    icon: "bg-cyan-500",    label: "text-cyan-400" },
  remove_tag:          { border: "border-cyan-500/50 hover:border-cyan-500",      bg: "bg-cyan-500/10 border-b border-cyan-500/20",    icon: "bg-cyan-500",    label: "text-cyan-400" },
  update_status:       { border: "border-orange-500/50 hover:border-orange-500",  bg: "bg-orange-500/10 border-b border-orange-500/20", icon: "bg-orange-500",  label: "text-orange-400" },
  add_internal_note:   { border: "border-yellow-500/50 hover:border-yellow-500",  bg: "bg-yellow-500/10 border-b border-yellow-500/20", icon: "bg-yellow-500",  label: "text-yellow-400" },
  wait_delay:          { border: "border-slate-500/50 hover:border-slate-500",    bg: "bg-slate-500/10 border-b border-slate-500/20",  icon: "bg-slate-500",   label: "text-slate-400" },
  ai_reply:            { border: "border-[#10b981]/50 hover:border-[#10b981]",    bg: "bg-[#10b981]/10 border-b border-[#10b981]/20",  icon: "bg-[#10b981]",   label: "text-[#10b981]" },
  sales_assistant:     { border: "border-[#10b981]/50 hover:border-[#10b981]",    bg: "bg-[#10b981]/10 border-b border-[#10b981]/20",  icon: "bg-[#10b981]",   label: "text-[#10b981]" },
  send_email:          { border: "border-sky-400/50 hover:border-sky-400",        bg: "bg-sky-400/10 border-b border-sky-400/20",      icon: "bg-sky-400",     label: "text-sky-400" },
  ai_classify_intent:  { border: "border-[#10b981]/50 hover:border-[#10b981]",    bg: "bg-[#10b981]/10 border-b border-[#10b981]/20",  icon: "bg-[#10b981]",   label: "text-[#10b981]" },
  update_lead_score:   { border: "border-pink-500/50 hover:border-pink-500",      bg: "bg-pink-500/10 border-b border-pink-500/20",    icon: "bg-pink-500",    label: "text-pink-400" },
  add_to_segment:      { border: "border-indigo-500/50 hover:border-indigo-500",  bg: "bg-indigo-500/10 border-b border-indigo-500/20", icon: "bg-indigo-500",  label: "text-indigo-400" },
  remove_from_segment: { border: "border-indigo-500/50 hover:border-indigo-500",  bg: "bg-indigo-500/10 border-b border-indigo-500/20", icon: "bg-indigo-500",  label: "text-indigo-400" },
  send_webhook:        { border: "border-teal-500/50 hover:border-teal-500",      bg: "bg-teal-500/10 border-b border-teal-500/20",    icon: "bg-teal-500",    label: "text-teal-400" },
  human_handoff:           { border: "border-red-500/50 hover:border-red-500",        bg: "bg-red-500/10 border-b border-red-500/20",      icon: "bg-red-500",     label: "text-red-400" },
  end_workflow:            { border: "border-muted-foreground/30 hover:border-muted-foreground", bg: "bg-muted/50 border-b border-border", icon: "bg-muted-foreground", label: "text-muted-foreground" },
  send_instagram_dm:       { border: "border-purple-500/50 hover:border-purple-500",  bg: "bg-purple-500/10 border-b border-purple-500/20", icon: "bg-purple-500",  label: "text-purple-400" },
  reply_instagram_comment: { border: "border-purple-500/50 hover:border-purple-500",  bg: "bg-purple-500/10 border-b border-purple-500/20", icon: "bg-purple-500",  label: "text-purple-400" },
  assign_instagram_lead:   { border: "border-pink-500/50 hover:border-pink-500",      bg: "bg-pink-500/10 border-b border-pink-500/20",    icon: "bg-pink-500",    label: "text-pink-400" },
  add_instagram_tag:       { border: "border-pink-500/50 hover:border-pink-500",      bg: "bg-pink-500/10 border-b border-pink-500/20",    icon: "bg-pink-500",    label: "text-pink-400" },
  escalate_to_whatsapp:    { border: "border-green-500/50 hover:border-green-500",    bg: "bg-green-500/10 border-b border-green-500/20",  icon: "bg-green-500",   label: "text-green-400" },
  send_messenger_message:  { border: "border-blue-500/50 hover:border-blue-500",      bg: "bg-blue-500/10 border-b border-blue-500/20",    icon: "bg-blue-500",    label: "text-blue-400" },
};

const ACTION_LABELS: Record<ActionType, string> = {
  send_message:        "Enviar mensaje",
  send_template:       "Enviar plantilla",
  assign_agent:        "Asignar agente",
  unassign_agent:      "Desasignar agente",
  add_tag:             "Añadir etiqueta",
  remove_tag:          "Eliminar etiqueta",
  update_status:       "Cambiar estado",
  add_internal_note:   "Nota interna",
  wait_delay:          "Esperar",
  ai_reply:            "Respuesta IA",
  sales_assistant:     "Asistente comercial",
  send_email:          "Enviar email",
  ai_classify_intent:  "Clasificar intención",
  update_lead_score:   "Actualizar lead score",
  add_to_segment:      "Añadir a segmento",
  remove_from_segment: "Eliminar de segmento",
  send_webhook:        "Enviar webhook",
  human_handoff:           "Traspaso humano",
  end_workflow:            "Fin del workflow",
  send_instagram_dm:       "Enviar DM Instagram",
  reply_instagram_comment: "Responder comentario",
  assign_instagram_lead:   "Asignar lead Instagram",
  add_instagram_tag:       "Etiquetar en Instagram",
  escalate_to_whatsapp:    "Escalar a WhatsApp",
  send_messenger_message:  "Enviar mensaje Messenger",
};

function describeAction(data: ActionNodeData): string {
  const a = data.action;
  switch (a.type) {
    case "send_message":
    case "send_instagram_dm":
    case "send_messenger_message":
    case "reply_instagram_comment": {
      const text = a.content ?? "";
      return text ? text.slice(0, 50) + (text.length > 50 ? "…" : "") : "(mensaje vacío)";
    }
    case "assign_agent":      return a.agentName ?? "Round-robin";
    case "add_tag":
    case "add_instagram_tag":
    case "remove_tag":        return a.tag ? `#${a.tag}` : "(sin etiqueta)";
    case "update_status":     return a.status ?? "";
    case "wait_delay":        return a.durationMs != null ? formatDelay(a.durationMs) : "0s";
    case "update_lead_score": return a.delta != null ? `${a.delta > 0 ? "+" : ""}${a.delta} pts` : "+0 pts";
    case "send_webhook":      return a.url ? a.url.replace(/^https?:\/\//, "") : "(sin URL)";
    default:                  return data.label ?? "";
  }
}

function formatDelay(ms: number): string {
  if (!ms || ms <= 0)  return "0s";
  if (ms < 60_000)     return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000)  return `${Math.round(ms / 60_000)}min`;
  return `${Math.round(ms / 3_600_000)}h`;
}

export const ActionNode = memo(function ActionNode({
  data,
  selected,
}: NodeProps) {
  const nodeData    = data as unknown as ActionNodeData;
  const actionType  = nodeData.action?.type ?? "send_message";
  const Icon        = ACTION_ICONS[actionType] ?? Send;
  const colors      = ACTION_COLORS[actionType] ?? ACTION_COLORS.send_message;
  const label       = nodeData.label || ACTION_LABELS[actionType] || "Acción";
  const detail      = nodeData.action ? describeAction(nodeData) : "";
  const isEnd       = actionType === "end_workflow";

  return (
    <div
      className={cn(
        "min-w-[200px] rounded-2xl border-2 bg-card shadow-lg transition-all",
        selected
          ? `${colors.border.replace("/50", "")} shadow-lg`
          : colors.border
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !bg-muted-foreground !border-2 !border-card"
      />

      <div className={cn("flex items-center gap-2.5 px-4 py-3 rounded-t-2xl", colors.bg)}>
        <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0", colors.icon)}>
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
        <div>
          <p className={cn("text-[10px] font-semibold uppercase tracking-wider", colors.label)}>Acción</p>
          <p className="text-xs font-semibold text-foreground leading-tight">{label}</p>
        </div>
      </div>

      {detail && (
        <div className="px-4 py-2">
          <p className="text-[11px] text-muted-foreground truncate max-w-[160px]">{detail}</p>
        </div>
      )}

      {!isEnd && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-3 !w-3 !bg-muted-foreground !border-2 !border-card"
        />
      )}
    </div>
  );
});
