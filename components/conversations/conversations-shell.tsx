"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { ConversationList } from "./conversation-list";
import { ChatWindow } from "./chat-window";
import { ContactPanel } from "./contact-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { useRealtimeInbox } from "@/lib/hooks/use-realtime-inbox";
import type { Conversation } from "@/types";

interface ConversationsShellProps {
  initialConversations: Conversation[];
  userId: string;
}

export function ConversationsShell({
  initialConversations,
  userId,
}: ConversationsShellProps) {
  const [activeConversation, setActiveConversation] =
    useState<Conversation | null>(null);
  const [showContactPanel, setShowContactPanel] = useState(false);

  const {
    filtered,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    isSearching,
  } = useRealtimeInbox({ initialConversations, userId });

  function handleSelect(conv: Conversation) {
    setActiveConversation(conv);
    setShowContactPanel(false);
  }

  function handleBack() {
    setActiveConversation(null);
    setShowContactPanel(false);
  }

  // Sync active conversation when the realtime list updates it
  function handleConversationUpdate(updated: Conversation) {
    setActiveConversation(updated);
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Conversation list panel ── */}
      <div
        className={
          activeConversation
            ? "hidden md:flex flex-col h-full border-r border-border bg-card w-80 shrink-0"
            : "flex flex-col h-full border-r border-border bg-card w-full md:w-80 shrink-0"
        }
      >
        <ConversationList
          conversations={filtered}
          activeId={activeConversation?.id ?? null}
          onSelect={handleSelect}
          filter={filter}
          onFilterChange={setFilter}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          isSearching={isSearching}
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
