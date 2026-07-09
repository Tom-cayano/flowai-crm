"use client";

import { useState } from "react";
import {
  MessageSquare, Hash, Clock, User, Tag,
  Send, UserCheck, UserX, RefreshCw, StickyNote,
  Bot, Brain, TrendingUp, Webhook, Square, GitBranch,
  ChevronDown, ChevronRight, Search, MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type { TriggerType, ActionType } from "@/types/automation";

interface PaletteItem {
  type: "trigger" | "condition" | "action";
  subtype: TriggerType | ActionType | "condition";
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
}

const TRIGGER_ITEMS: PaletteItem[] = [
  { type: "trigger", subtype: "message_received",           label: "Mensaje recibido",          description: "Cualquier mensaje entrante",              icon: MessageSquare, color: "text-[#10b981]" },
  { type: "trigger", subtype: "first_message",              label: "Primer mensaje",             description: "Primera vez que contacta",                icon: MessageSquare, color: "text-[#10b981]" },
  { type: "trigger", subtype: "keyword_match",              label: "Coincidencia de keyword",    description: "Mensaje contiene palabra clave",          icon: Hash,         color: "text-[#10b981]" },
  { type: "trigger", subtype: "conversation_created",       label: "Conversación creada",        description: "Nueva conversación abierta",              icon: MessageSquare, color: "text-[#10b981]" },
  { type: "trigger", subtype: "conversation_status_changed",label: "Cambio de estado",           description: "El estado de la conv. cambia",           icon: RefreshCw,    color: "text-[#10b981]" },
  { type: "trigger", subtype: "tag_added",                  label: "Etiqueta añadida",           description: "Se añade una etiqueta",                  icon: Tag,          color: "text-[#10b981]" },
  { type: "trigger", subtype: "contact_created",            label: "Contacto creado",            description: "Se crea un nuevo contacto",              icon: User,         color: "text-[#10b981]" },
  { type: "trigger", subtype: "no_response_timeout",        label: "Sin respuesta",              description: "Sin respuesta del agente en N minutos",  icon: Clock,        color: "text-[#10b981]" },
  { type: "trigger", subtype: "lead_score_threshold",       label: "Lead score umbral",          description: "El score supera un valor",               icon: TrendingUp,   color: "text-[#10b981]" },
  { type: "trigger", subtype: "scheduled_cron",             label: "Programado (cron)",          description: "Ejecuta según expresión cron",           icon: Clock,        color: "text-[#10b981]" },
  { type: "trigger", subtype: "webhook_lead",               label: "Webhook entrante",           description: "Lead desde una app externa conectada",   icon: Webhook,      color: "text-sky-400" },
  // Instagram
  { type: "trigger", subtype: "instagram_dm_received",      label: "IG · DM recibido",           description: "Mensaje directo de Instagram",            icon: MessageCircle, color: "text-purple-400" },
  { type: "trigger", subtype: "instagram_comment_received", label: "IG · Comentario recibido",   description: "Comentario en publicación o reel",        icon: MessageCircle, color: "text-purple-400" },
  { type: "trigger", subtype: "instagram_story_mention",    label: "IG · Mención en story",      description: "Alguien menciona en una historia",        icon: MessageCircle, color: "text-purple-400" },
  { type: "trigger", subtype: "instagram_first_contact",    label: "IG · Primer contacto",       description: "Primera vez que contacta por IG",         icon: MessageCircle, color: "text-purple-400" },
  { type: "trigger", subtype: "instagram_lead_detected",    label: "IG · Lead detectado",        description: "IA detecta intención de compra en IG",   icon: TrendingUp,    color: "text-purple-400" },
];

const CONDITION_ITEMS: PaletteItem[] = [
  { type: "condition", subtype: "condition", label: "Condición / Bifurcación", description: "Ramifica el flujo según reglas", icon: GitBranch, color: "text-amber-400" },
];

const ACTION_ITEMS: PaletteItem[] = [
  { type: "action", subtype: "send_message",        label: "Enviar mensaje",         description: "Envía un mensaje al contacto",          icon: Send,      color: "text-blue-400" },
  { type: "action", subtype: "send_template",       label: "Enviar plantilla",       description: "Envía una plantilla de WhatsApp",       icon: Send,      color: "text-blue-400" },
  { type: "action", subtype: "assign_agent",        label: "Asignar agente",         description: "Asigna la conv. a un agente",           icon: UserCheck, color: "text-violet-400" },
  { type: "action", subtype: "unassign_agent",      label: "Desasignar agente",      description: "Quita el agente asignado",              icon: UserX,     color: "text-violet-400" },
  { type: "action", subtype: "add_tag",             label: "Añadir etiqueta",        description: "Añade una etiqueta al contacto",        icon: Tag,       color: "text-cyan-400" },
  { type: "action", subtype: "remove_tag",          label: "Eliminar etiqueta",      description: "Quita una etiqueta del contacto",       icon: Tag,       color: "text-cyan-400" },
  { type: "action", subtype: "update_status",       label: "Cambiar estado",         description: "Cambia el estado de la conversación",   icon: RefreshCw, color: "text-orange-400" },
  { type: "action", subtype: "add_internal_note",   label: "Nota interna",           description: "Añade una nota visible solo a agentes", icon: StickyNote,color: "text-yellow-400" },
  { type: "action", subtype: "wait_delay",          label: "Esperar",                description: "Pausa el flujo por un tiempo",          icon: Clock,     color: "text-slate-400" },
  { type: "action", subtype: "ai_reply",            label: "Respuesta IA",           description: "Responde usando IA generativa",         icon: Bot,       color: "text-[#10b981]" },
  { type: "action", subtype: "sales_assistant",     label: "Asistente comercial",    description: "Funnel de reservas: valoración o clase de prueba", icon: Bot, color: "text-[#10b981]" },
  { type: "action", subtype: "ai_classify_intent",  label: "Clasificar intención",   description: "Clasifica el mensaje con IA",           icon: Brain,     color: "text-[#10b981]" },
  { type: "action", subtype: "update_lead_score",   label: "Actualizar lead score",  description: "Suma o resta puntos al lead score",     icon: TrendingUp,color: "text-pink-400" },
  { type: "action", subtype: "add_to_segment",      label: "Añadir a segmento",      description: "Añade el contacto a un segmento",       icon: UserCheck, color: "text-indigo-400" },
  { type: "action", subtype: "remove_from_segment", label: "Quitar de segmento",     description: "Quita el contacto de un segmento",      icon: UserX,     color: "text-indigo-400" },
  { type: "action", subtype: "send_webhook",        label: "Enviar webhook",         description: "Realiza una llamada HTTP a una URL",    icon: Webhook,   color: "text-teal-400" },
  { type: "action", subtype: "human_handoff",       label: "Traspaso humano",        description: "Escala a un agente humano",             icon: UserCheck, color: "text-red-400" },
  { type: "action", subtype: "end_workflow",           label: "Fin del workflow",          description: "Finaliza la ejecución del flujo",            icon: Square,       color: "text-muted-foreground" },
  // Instagram
  { type: "action", subtype: "send_instagram_dm",       label: "IG · Enviar DM",            description: "Envía un DM por Instagram",                   icon: MessageCircle, color: "text-purple-400" },
  { type: "action", subtype: "reply_instagram_comment", label: "IG · Responder comentario", description: "Responde al comentario que disparó el flujo", icon: MessageCircle, color: "text-purple-400" },
  { type: "action", subtype: "assign_instagram_lead",   label: "IG · Clasificar lead",      description: "Etiqueta el lead como hot/warm/cold",         icon: TrendingUp,    color: "text-purple-400" },
  { type: "action", subtype: "add_instagram_tag",       label: "IG · Añadir etiqueta",      description: "Añade una etiqueta al contacto de IG",        icon: Tag,           color: "text-purple-400" },
  { type: "action", subtype: "escalate_to_whatsapp",    label: "IG · Escalar a WhatsApp",   description: "Envía el hilo a WhatsApp",                    icon: RefreshCw,     color: "text-purple-400" },
];

interface CategoryProps {
  title: string;
  accent: string;
  items: PaletteItem[];
  query: string;
  defaultOpen?: boolean;
}

function PaletteCategory({ title, accent, items, query, defaultOpen = true }: CategoryProps) {
  const [open, setOpen] = useState(defaultOpen);

  const filtered = query
    ? items.filter(
        (i) =>
          i.label.toLowerCase().includes(query.toLowerCase()) ||
          i.description.toLowerCase().includes(query.toLowerCase())
      )
    : items;

  if (filtered.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className={cn("h-1.5 w-1.5 rounded-full", accent)} />
        {title}
      </button>

      {open && (
        <div className="space-y-0.5 px-2 pb-2">
          {filtered.map((item) => (
            <DraggableNode key={`${item.type}-${item.subtype}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function DraggableNode({ item }: { item: PaletteItem }) {
  const Icon = item.icon;

  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      "application/reactflow",
      JSON.stringify({ nodeType: item.type, subtype: item.subtype, label: item.label })
    );
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cn(
        "group flex items-start gap-2.5 rounded-lg p-2.5 cursor-grab active:cursor-grabbing",
        "hover:bg-accent/50 transition-colors select-none"
      )}
    >
      <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", item.color)} />
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground leading-tight truncate">{item.label}</p>
        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-2">{item.description}</p>
      </div>
    </div>
  );
}

export function NodePalette() {
  const [query, setQuery] = useState("");

  return (
    <div className="flex flex-col h-full bg-card border-r border-border w-[220px] shrink-0">
      <div className="px-3 py-3 border-b border-border">
        <p className="text-xs font-semibold text-foreground mb-2">Nodos</p>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2 space-y-1">
        <PaletteCategory
          title="Disparadores"
          accent="bg-[#10b981]"
          items={TRIGGER_ITEMS}
          query={query}
          defaultOpen
        />
        <PaletteCategory
          title="Condiciones"
          accent="bg-amber-400"
          items={CONDITION_ITEMS}
          query={query}
          defaultOpen
        />
        <PaletteCategory
          title="Acciones"
          accent="bg-blue-500"
          items={ACTION_ITEMS}
          query={query}
          defaultOpen
        />
      </div>

      <div className="px-3 py-2 border-t border-border">
        <p className="text-[10px] text-muted-foreground">Arrastra un nodo al canvas</p>
      </div>
    </div>
  );
}
