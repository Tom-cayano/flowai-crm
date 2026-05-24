"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare, Settings, AlertCircle, ExternalLink } from "lucide-react";
import { ConversationList } from "@/components/conversations/conversation-list";
import { ChatWindow } from "@/components/conversations/chat-window";
import { ContactPanel } from "@/components/conversations/contact-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { useRealtimeInbox } from "@/lib/hooks/use-realtime-inbox";
import type { Conversation } from "@/types";
import type { IGAccountSummary } from "@/lib/actions/instagram";

// ─── Instagram gradient icon ──────────────────────────────────────────────────
// Used without lucide-react since it doesn't ship an Instagram icon.

function IGIcon({ size = 20, id = "ig-default" }: { size?: number; id?: string }) {
  const gradId = `ig-grad-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#feda75" />
          <stop offset="25%"  stopColor="#fa7e1e" />
          <stop offset="50%"  stopColor="#d62976" />
          <stop offset="75%"  stopColor="#962fbf" />
          <stop offset="100%" stopColor="#4f5bd5" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="6"
        stroke={`url(#${gradId})`} strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4.5"
        stroke={`url(#${gradId})`} strokeWidth="1.8" />
      <circle cx="17.5" cy="6.5" r="1"
        fill={`url(#${gradId})`} />
    </svg>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface InstagramShellProps {
  accounts:             IGAccountSummary[];
  allowed:              boolean;
  initialConversations: Conversation[];
  userId:               string;
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function InstagramShell({
  accounts,
  allowed,
  initialConversations,
  userId,
}: InstagramShellProps) {
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [showContactPanel, setShowContactPanel]     = useState(false);

  // Use the shared realtime inbox — filter to instagram channel client-side so
  // real-time updates from other channels don't bleed into this view.
  const { filtered, filter, setFilter, searchQuery, setSearchQuery, isSearching } =
    useRealtimeInbox({ initialConversations, userId });

  const igConversations = filtered.filter((c) => c.channel === "instagram");

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
        <ShellHeader accounts={[]} />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-xs text-center space-y-4">
            <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mx-auto">
              <IGIcon size={28} id="gate" />
            </div>
            <h2 className="text-base font-semibold">Requiere plan superior</h2>
            <p className="text-sm text-muted-foreground">
              Actualiza tu plan para conectar Instagram Business y gestionar DMs desde el CRM.
            </p>
            <Button asChild size="sm">
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

  // ── No account connected ─────────────────────────────────────────────────
  if (accounts.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <ShellHeader accounts={[]} />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-xs text-center space-y-4">
            <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mx-auto">
              <IGIcon size={28} id="empty" />
            </div>
            <h2 className="text-base font-semibold">Conecta tu cuenta de Instagram</h2>
            <p className="text-sm text-muted-foreground">
              Vincula tu cuenta Instagram Business para recibir y responder mensajes directos aquí.
            </p>
            <Button asChild size="sm">
              <Link href="/settings/instagram">Conectar cuenta</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Has accounts ─────────────────────────────────────────────────────────
  const hasError = accounts.some((a) => a.connection_state !== "connected");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ShellHeader accounts={accounts} />

      {hasError && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs bg-amber-500/10 border-b border-amber-500/20 text-amber-400 shrink-0">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Una o más cuentas tienen un problema de conexión.{" "}
          <Link href="/settings/instagram" className="underline underline-offset-2 hover:opacity-80">
            Revisar
          </Link>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* ── Conversation list ──────────────────────────────────────────── */}
        <div
          className={
            activeConversation
              ? "hidden md:flex flex-col h-full border-r border-border bg-card w-80 shrink-0"
              : "flex flex-col h-full border-r border-border bg-card w-full md:w-80 shrink-0"
          }
        >
          <ConversationList
            conversations={igConversations}
            activeId={activeConversation?.id ?? null}
            onSelect={handleSelect}
            filter={filter}
            onFilterChange={setFilter}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            isSearching={isSearching}
          />
        </div>

        {/* ── Chat window / empty state ──────────────────────────────────── */}
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
              description="Elige un mensaje directo de la lista para ver el hilo y responder."
            />
          </div>
        )}

        {/* ── Contact panel ─────────────────────────────────────────────── */}
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

function ShellHeader({ accounts }: { accounts: IGAccountSummary[] }) {
  const connected = accounts.filter((a) => a.connection_state === "connected");

  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0 bg-card">
      <div className="flex items-center gap-2.5">
        <IGIcon size={20} id="header" />
        <div>
          <h1 className="text-sm font-semibold leading-tight">Instagram DM</h1>
          {connected.length > 0 && (
            <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
              {connected.map((a) => `@${a.ig_username}`).join(", ")}
            </p>
          )}
        </div>
      </div>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" asChild>
        <Link href="/settings/instagram" title="Configurar Instagram">
          <Settings className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
