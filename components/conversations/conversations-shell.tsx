"use client";

/**
 * ConversationsShell — FASE 5: tabs omnicanal escalables.
 *
 * Cambios respecto a la versión original:
 *   - Nuevo estado `channelTab: Channel | "all"` para el tab activo
 *   - Los tabs se generan dinámicamente desde los canales presentes en la lista
 *     (+ siempre el tab "Todos") — escala a futuros canales sin tocar este archivo
 *   - Se pasa `channelFilter` al hook `useRealtimeInbox` para filtrar la lista
 *   - Se pasa `channelFilter` a `ConversationList` para el header contextual
 *   - La lógica de selección, realtime y contactPanel es idéntica al original
 *   - WhatsApp no se toca: sigue funcionando exactamente igual en el tab "Todos"
 *     y en su tab específico
 */

import { useState, useMemo }   from "react";
import { MessageSquare }       from "lucide-react";
import { ConversationList }    from "./conversation-list";
import { ChatWindow }          from "./chat-window";
import { ContactPanel }        from "./contact-panel";
import { EmptyState }          from "@/components/ui/empty-state";
import {
  ChannelBadge,
  CHANNEL_CONFIG,
  type Channel,
}                              from "@/components/ui/channel-badge";
import { useRealtimeInbox }    from "@/lib/hooks/use-realtime-inbox";
import { cn }                  from "@/lib/utils";
import type { Conversation }   from "@/types";

type ChannelTab = Channel | "all";

interface ConversationsShellProps {
  initialConversations: Conversation[];
  userId:               string;
}

// ─── Orden de canales en los tabs ─────────────────────────────────────────────
// Añadir futuros canales aquí para controlar su posición en la tab bar.
const CHANNEL_TAB_ORDER: Channel[] = [
  "whatsapp",
  "instagram",
  "messenger",
  "email",
  "sms",
];

export function ConversationsShell({
  initialConversations,
  userId,
}: ConversationsShellProps) {
  const [channelTab, setChannelTab]             = useState<ChannelTab>("all");
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [showContactPanel, setShowContactPanel] = useState(false);

  const {
    conversations,
    filtered,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    isSearching,
  } = useRealtimeInbox({
    initialConversations,
    userId,
    channelFilter: channelTab,
  });

  // ── Tabs disponibles (solo canales que tienen al menos 1 conversación) ────
  const availableTabs = useMemo<ChannelTab[]>(() => {
    const channelSet = new Set(conversations.map((c) => c.channel));
    const sorted     = CHANNEL_TAB_ORDER.filter((ch) => channelSet.has(ch));
    // Solo mostrar la tab bar si hay más de 1 canal distinto
    return sorted.length > 1 ? ["all", ...sorted] : [];
  }, [conversations]);

  function handleSelect(conv: Conversation) {
    setActiveConversation(conv);
    setShowContactPanel(false);
  }

  function handleBack() {
    setActiveConversation(null);
    setShowContactPanel(false);
  }

  function handleConversationUpdate(updated: Conversation) {
    setActiveConversation(updated);
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Panel izquierdo: lista + tabs ── */}
      <div
        className={cn(
          "flex flex-col h-full border-r border-border bg-card shrink-0",
          activeConversation
            ? "hidden md:flex w-80"
            : "flex w-full md:w-80"
        )}
      >
        {/* Tab bar omnicanal — solo visible cuando hay >1 canal */}
        {availableTabs.length > 0 && (
          <OmnichannelTabBar
            tabs={availableTabs}
            active={channelTab}
            conversations={conversations}
            onTabChange={(tab) => {
              setChannelTab(tab);
              setActiveConversation(null);
            }}
          />
        )}

        <ConversationList
          conversations={filtered}
          activeId={activeConversation?.id ?? null}
          onSelect={handleSelect}
          filter={filter}
          onFilterChange={setFilter}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          isSearching={isSearching}
          channelFilter={channelTab}
          onConversationCreated={(conv) => {
            setActiveConversation(conv);
          }}
        />
      </div>

      {/* ── Chat window / empty state ── */}
      {activeConversation ? (
        <ChatWindow
          conversation={activeConversation}
          userId={userId}
          onToggleContactPanel={() => setShowContactPanel((s) => !s)}
          onBack={handleBack}
          onConversationUpdate={handleConversationUpdate}
        />
      ) : (
        <div className="flex-1 hidden md:flex items-center justify-center bg-background">
          <EmptyState
            icon={MessageSquare}
            title="Selecciona una conversación"
            description="Elige una conversación de la lista para empezar a chatear con tu contacto."
          />
        </div>
      )}

      {/* ── Contact panel ── */}
      {activeConversation && showContactPanel && (
        <ContactPanel
          conversation={activeConversation}
          onClose={() => setShowContactPanel(false)}
        />
      )}
    </div>
  );
}

// ─── OmnichannelTabBar ────────────────────────────────────────────────────────
// Componente interno: barra de tabs por canal.
// Recibe la lista completa para calcular contadores de no-leídos por canal.

interface OmnichannelTabBarProps {
  tabs:          ChannelTab[];
  active:        ChannelTab;
  conversations: Conversation[];
  onTabChange:   (tab: ChannelTab) => void;
}

function OmnichannelTabBar({
  tabs,
  active,
  conversations,
  onTabChange,
}: OmnichannelTabBarProps) {
  return (
    <div className="flex items-center gap-0 px-3 pt-3 pb-0 border-b border-border shrink-0 overflow-x-auto scrollbar-none">
      {tabs.map((tab) => {
        const isActive = tab === active;

        // Unread count por tab
        const unread =
          tab === "all"
            ? conversations.reduce((n, c) => n + c.unreadCount, 0)
            : conversations
                .filter((c) => c.channel === tab)
                .reduce((n, c) => n + c.unreadCount, 0);

        return (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className={cn(
              "relative flex items-center gap-1.5 px-2.5 pb-2 pt-0.5 text-[11px] font-medium whitespace-nowrap",
              "border-b-2 transition-all duration-150",
              isActive
                ? "border-[#10b981] text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "all" ? (
              <span>Todos</span>
            ) : (
              <ChannelBadge
                channel={tab}
                variant="icon"
                size="sm"
                id={`tab-${tab}`}
              />
            )}

            {tab !== "all" && (
              <span>{CHANNEL_CONFIG[tab]?.label ?? tab}</span>
            )}

            {/* Badge de no-leídos */}
            {unread > 0 && (
              <span className="inline-flex items-center justify-center h-3.5 min-w-[14px] px-0.5 rounded-full bg-[#10b981] text-[#030712] text-[8px] font-bold leading-none">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
