"use client";

/**
 * ConversationList — FASE 4: prop channelFilter + header contextual por canal.
 *
 * Cambios respecto a la versión original:
 *   - Nueva prop opcional `channelFilter?: Channel | "all"` (default "all")
 *   - Cuando channelFilter !== "all", el header muestra el ChannelBadge del canal
 *     en lugar del título genérico "Conversaciones"
 *   - Los filtros de status/mine son exactamente los mismos
 *   - Pasa channelFilter al hook no es necesario aquí: el shell ya filtra la lista
 *     antes de pasarla a este componente
 */

import {
  Search,
  MessageSquarePlus,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { Input }   from "@/components/ui/input";
import { Button }  from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton }   from "@/components/ui/skeleton";
import { ChannelBadge, type Channel } from "@/components/ui/channel-badge";
import { ConversationItem }           from "./conversation-item";
import { cn }                         from "@/lib/utils";
import type { Conversation }          from "@/types";
import type { InboxFilter }           from "@/lib/hooks/use-realtime-inbox";

const STATUS_FILTERS: { value: InboxFilter; label: string }[] = [
  { value: "all",     label: "Todas"      },
  { value: "open",    label: "Abiertas"   },
  { value: "pending", label: "Pendientes" },
  { value: "mine",    label: "Mías"       },
];

interface ConversationListProps {
  conversations:  Conversation[];
  activeId:       string | null;
  onSelect:       (conv: Conversation) => void;
  filter:         InboxFilter;
  onFilterChange: (f: InboxFilter) => void;
  searchQuery:    string;
  onSearchChange: (q: string) => void;
  isLoading?:     boolean;
  isSearching?:   boolean;
  /**
   * Cuando se pasa un canal específico (distinto de "all"), el header
   * muestra el badge del canal en lugar del título genérico "Conversaciones".
   * Usado por InstagramShell y MessengerShell.
   */
  channelFilter?: Channel | "all";
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  isLoading      = false,
  isSearching    = false,
  channelFilter  = "all",
}: ConversationListProps) {
  const totalUnread      = conversations.reduce((n, c) => n + c.unreadCount, 0);
  const showChannelBadge = channelFilter !== "all";

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 space-y-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {showChannelBadge ? (
              /* Header contextual con badge del canal activo */
              <ChannelBadge channel={channelFilter} variant="pill" size="md" />
            ) : (
              /* Header genérico omnicanal */
              <h2 className="text-sm font-semibold">Conversaciones</h2>
            )}
            {totalUnread > 0 && (
              <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-[#10b981] text-[#030712] text-[9px] font-bold leading-none">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
        </div>

        {/* Búsqueda */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar conversaciones..."
            className="pl-8 pr-8 h-8 text-xs bg-muted border-0"
          />
          {isSearching && (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin pointer-events-none" />
          )}
        </div>

        {/* Filter tabs — idénticos al original */}
        <div className="flex gap-0 -mb-px">
          {STATUS_FILTERS.map(({ value, label }) => {
            const count =
              value === "all"
                ? conversations.length
                : conversations.filter((c) =>
                    value === "mine"
                      ? c.assignedTo !== undefined
                      : c.status === value
                  ).length;

            return (
              <button
                key={value}
                onClick={() => onFilterChange(value)}
                className={cn(
                  "flex-1 py-1 text-[10px] font-medium border-b-2 transition-colors whitespace-nowrap",
                  filter === value
                    ? "border-[#10b981] text-[#10b981]"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
                {count > 0 && (
                  <span className={cn(
                    "ml-0.5 text-[9px]",
                    filter === value ? "text-[#10b981]" : "text-muted-foreground/60"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Lista ── */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-border/50">
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-2.5 w-40" />
                  <Skeleton className="h-2.5 w-16" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center mb-3">
              {showChannelBadge ? (
                <ChannelBadge channel={channelFilter} variant="icon" size="lg" />
              ) : (
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <p className="text-xs font-medium text-foreground mb-1">
              {searchQuery ? "Sin resultados" : "Sin conversaciones"}
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {searchQuery
                ? `No se encontraron resultados para "${searchQuery}".`
                : filter !== "all"
                ? `No hay conversaciones ${STATUS_FILTERS.find((f) => f.value === filter)?.label.toLowerCase()}.`
                : "Las conversaciones aparecerán aquí cuando empieces a chatear."}
            </p>
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === activeId}
              onClick={() => onSelect(conv)}
            />
          ))
        )}
      </ScrollArea>
    </div>
  );
}
