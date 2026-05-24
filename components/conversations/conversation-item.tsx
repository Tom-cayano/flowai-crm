"use client";

/**
 * ConversationItem — FASE 2: añadido badge de canal (ChannelBadge).
 *
 * Cambios respecto a la versión original:
 *   - Importa ChannelBadge desde @/components/ui/channel-badge
 *   - Renderiza el badge junto al nombre del contacto (variante "icon", size "sm")
 *   - Pasa conversation.id como `id` al ChannelBadge para evitar colisiones de
 *     gradiente SVG cuando se renderizan múltiples items de Instagram simultáneamente
 *   - El resto de la lógica y estilos es idéntico al original
 */

import { Check, CheckCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ChannelBadge } from "@/components/ui/channel-badge";
import { cn, formatTime, getInitials } from "@/lib/utils";
import type { Conversation, ConversationStatus } from "@/types";

interface ConversationItemProps {
  conversation: Conversation;
  isActive:     boolean;
  onClick:      () => void;
}

const statusColors: Record<string, string> = {
  open:     "bg-primary",
  pending:  "bg-amber-500",
  resolved: "bg-emerald-500",
  spam:     "bg-red-500",
};

const conversationStatusLabel: Record<ConversationStatus, string> = {
  open:     "Abierta",
  pending:  "Pendiente",
  resolved: "Resuelta",
  spam:     "Spam",
};

export function ConversationItem({
  conversation,
  isActive,
  onClick,
}: ConversationItemProps) {
  const { contact, lastMessage, unreadCount, status, updatedAt } = conversation;
  const displayName  = contact?.name || "Sin nombre";
  const isFromContact = lastMessage?.sender === "contact";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 border-b border-border/50",
        isActive && "bg-accent"
      )}
    >
      {/* ── Avatar ── */}
      <div className="relative shrink-0">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="text-sm">{getInitials(displayName)}</AvatarFallback>
        </Avatar>
        {contact.status === "active" && (
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card" />
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 min-w-0">
        {/* Fila 1: nombre + badge de canal + timestamp */}
        <div className="flex items-center justify-between mb-0.5 gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-semibold text-foreground truncate">
              {displayName}
            </span>
            {/* Badge de canal — icono only para no ocupar demasiado espacio */}
            <ChannelBadge
              channel={conversation.channel}
              variant="icon"
              size="sm"
              id={conversation.id}
            />
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
            {formatTime(updatedAt)}
          </span>
        </div>

        {/* Fila 2: preview del último mensaje */}
        <div className="flex items-center gap-1 mb-1">
          {!isFromContact && (
            lastMessage?.status === "read" ? (
              <CheckCheck className="h-3 w-3 shrink-0 text-primary" />
            ) : lastMessage?.status === "delivered" ? (
              <CheckCheck className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <Check className="h-3 w-3 shrink-0 text-muted-foreground" />
            )
          )}
          <p className={cn(
            "text-xs truncate",
            unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"
          )}>
            {lastMessage?.content ?? "Sin mensajes"}
          </p>
        </div>

        {/* Fila 3: estado + tags */}
        <div className="flex items-center gap-1.5">
          <span className={cn(
            "inline-block w-1.5 h-1.5 rounded-full shrink-0",
            statusColors[status] ?? "bg-muted"
          )} />
          <span className="text-[10px] text-muted-foreground">
            {conversationStatusLabel[status] ?? status}
          </span>
          {conversation.tags.slice(0, 1).map((tag) => (
            <Badge key={tag} variant="muted" className="text-[9px] h-4 px-1 py-0">
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      {/* ── Unread badge ── */}
      {unreadCount > 0 && (
        <Badge
          variant="default"
          className="h-4.5 min-w-[18px] px-1 text-[10px] font-bold shrink-0 mt-1"
        >
          {unreadCount}
        </Badge>
      )}
    </button>
  );
}
