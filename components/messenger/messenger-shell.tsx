"use client";

/**
 * MessengerShell — Shell de Facebook Messenger.
 *
 * Adaptado al schema real de facebook_pages (sin connection_state / last_error):
 *   - El estado "conectado" se deriva de is_active
 *   - No hay banner de error (no existe last_error en el schema actual)
 *   - El resto del comportamiento es idéntico a InstagramShell
 */

import { useState }  from "react";
import Link          from "next/link";
import {
  MessageSquare,
  Settings,
  ExternalLink,
} from "lucide-react";
import { ConversationList } from "@/components/conversations/conversation-list";
import { ChatWindow }       from "@/components/conversations/chat-window";
import { ContactPanel }     from "@/components/conversations/contact-panel";
import { EmptyState }       from "@/components/ui/empty-state";
import { Button }           from "@/components/ui/button";
import { MessengerIcon }    from "@/components/ui/channel-badge";
import { useRealtimeInbox } from "@/lib/hooks/use-realtime-inbox";
import type { Conversation }  from "@/types";
import type { FBPageSummary } from "@/lib/actions/messenger";

// ─── Props ────────────────────────────────────────────────────────────────────

interface MessengerShellProps {
  pages:                FBPageSummary[];
  allowed:              boolean;
  initialConversations: Conversation[];
  userId:               string;
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function MessengerShell({
  pages,
  allowed,
  initialConversations,
  userId,
}: MessengerShellProps) {
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
  } = useRealtimeInbox({
    initialConversations,
    userId,
    channelFilter: "messenger",
  });

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

  // ── Plan gate ────────────────────────────────────────────────────────────
  if (!allowed) {
    return (
      <div className="flex flex-col h-full">
        <MessengerShellHeader pages={[]} />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-[280px] text-center space-y-4">
            <div className="h-14 w-14 rounded-2xl bg-[rgba(0,132,255,0.08)] border border-[rgba(0,132,255,0.15)] flex items-center justify-center mx-auto">
              <MessengerIcon size={28} color="#0084ff" />
            </div>
            <h2 className="text-base font-semibold">Requiere plan Pro o superior</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Actualiza tu plan para conectar Facebook Messenger y gestionar
              conversaciones desde el CRM.
            </p>
            <Button asChild size="sm" className="w-full">
              <Link href="/settings/billing">
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                Ver planes
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Sin páginas conectadas ────────────────────────────────────────────────
  if (pages.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <MessengerShellHeader pages={[]} />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-[280px] text-center space-y-4">
            <div className="h-14 w-14 rounded-2xl bg-[rgba(0,132,255,0.08)] border border-[rgba(0,132,255,0.15)] flex items-center justify-center mx-auto">
              <MessengerIcon size={28} color="#0084ff" />
            </div>
            <h2 className="text-base font-semibold">Conecta tu página de Facebook</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Vincula una página de Facebook para recibir y responder mensajes
              de Messenger directamente desde aquí.
            </p>
            <Button asChild size="sm" className="w-full">
              <Link href="/settings">
                <Settings className="mr-2 h-3.5 w-3.5" />
                Configurar integración
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Vista principal ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <MessengerShellHeader pages={pages} />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Lista de conversaciones ────────────────────────────────── */}
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
            channelFilter="messenger"
          />
        </div>

        {/* ── Chat window / empty state ──────────────────────────────── */}
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
              description="Elige un mensaje de Messenger de la lista para ver el hilo y responder."
            />
          </div>
        )}

        {/* ── Panel de contacto ──────────────────────────────────────── */}
        {activeConversation && showContactPanel && (
          <ContactPanel
            conversation={activeConversation}
            onClose={() => setShowContactPanel(false)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function MessengerShellHeader({ pages }: { pages: FBPageSummary[] }) {
  // Todas las páginas en este array son is_active=true (filtradas en servidor)
  const hasPages = pages.length > 0;

  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0 bg-card">
      <div className="flex items-center gap-2.5">
        <MessengerIcon size={20} color="#0084ff" />
        <div>
          <h1 className="text-sm font-semibold leading-tight">Messenger</h1>
          {hasPages && (
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
              {pages
                .map((p) => p.page_name ?? `Página ${p.page_id.slice(-4)}`)
                .join(", ")}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Indicador de estado: is_active=true → todas conectadas */}
        {hasPages && (
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-[10px] text-muted-foreground">Conectado</span>
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          asChild
        >
          <Link href="/settings" title="Configurar Messenger">
            <Settings className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
