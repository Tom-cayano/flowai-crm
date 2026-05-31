"use client";

/**
 * useRealtimeInbox — FASE 3: añadido channelFilter opcional.
 *
 * Cambios respecto a la versión original:
 *   - Nueva opción `channelFilter?: Channel | "all"` (default "all" = sin filtro)
 *   - El filtro de canal se aplica en cliente DESPUÉS del filtro de status/mine
 *   - La suscripción realtime es exactamente la misma — canal-agnóstica por diseño
 *   - Todo lo demás es idéntico al original
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { mapRealtimeConversation } from "@/lib/conversations-mapper";
import { getConversations, searchConversations } from "@/lib/actions/conversations";
import type { Conversation, ConversationStatus } from "@/types";
import type { Channel } from "@/components/ui/channel-badge";

export type InboxFilter = ConversationStatus | "all" | "mine";

interface UseRealtimeInboxOptions {
  initialConversations: Conversation[];
  userId:               string;
  /** Filtra las conversaciones por canal. "all" (default) no aplica filtro. */
  channelFilter?:       Channel | "all";
}

interface UseRealtimeInboxReturn {
  conversations: Conversation[];
  filtered:      Conversation[];
  filter:        InboxFilter;
  setFilter:     (f: InboxFilter) => void;
  searchQuery:   string;
  setSearchQuery: (q: string) => void;
  isSearching:   boolean;
  refresh:       () => Promise<void>;
}

export function useRealtimeInbox({
  initialConversations,
  userId,
  channelFilter = "all",
}: UseRealtimeInboxOptions): UseRealtimeInboxReturn {
  const [conversations, setConversations] =
    useState<Conversation[]>(initialConversations);
  const [filter, setFilter]               = useState<InboxFilter>("all");
  const [searchQuery, setSearchQuery]     = useState("");
  const [searchResults, setSearchResults] = useState<Conversation[] | null>(null);
  const [isSearching, setIsSearching]     = useState(false);

  // Sync cuando el Server Component re-renderiza con datos frescos
  const prevInitialRef = useRef(initialConversations);
  useEffect(() => {
    if (prevInitialRef.current !== initialConversations) {
      prevInitialRef.current = initialConversations;
      setConversations(initialConversations);
    }
  }, [initialConversations]);

  const refresh = useCallback(async () => {
    const result = await getConversations();
    if (result.data) setConversations(result.data);
  }, []);

  // ── Búsqueda FTS con debounce ─────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      const result = await searchConversations(searchQuery);
      setSearchResults(result.data ?? null);
      setIsSearching(false);
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ── Realtime: conversations UPDATE (last_message, status, unread_count) ──
  // No server-side filter: relying on RLS (auth.uid() = user_id) alone.
  // Filtered postgres_changes on non-PK UUID columns silently drop events in
  // some Supabase Realtime versions — removing the filter is the safe path.
  // Client-side guard below ensures only this user's rows are processed.
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`inbox:${userId}`)
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "conversations",
        },
        (payload) => {
          const raw = payload.new as Record<string, unknown>;
          // Client-side guard — RLS should prevent foreign rows, but be explicit.
          if (raw.user_id !== userId) return;

          const updated = mapRealtimeConversation(raw);
          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.id === updated.id);
            if (idx === -1) {
              // Conversation not in local state (race on INSERT) — refetch.
              void refresh();
              return prev;
            }
            const next = [...prev];
            next[idx] = updated;
            return next.sort(
              (a, b) =>
                new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event:  "INSERT",
          schema: "public",
          table:  "conversations",
        },
        (payload) => {
          const raw = payload.new as Record<string, unknown>;
          if (raw.user_id !== userId) return;
          // Refetch on insert — new conversations need the fully denormalized shape.
          void refresh();
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR") {
          console.error("[realtime] inbox subscription error:", err?.message);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  // ── Filtrado en cliente ───────────────────────────────────────────────────
  // Orden: source → filtro de status/mine → filtro de canal (nuevo en FASE 3)
  const source = searchResults ?? conversations;

  const filtered = source.filter((c) => {
    // 1. Filtro de status / asignación (idéntico al original)
    if (filter !== "all") {
      if (filter === "mine") {
        if (c.assignedTo !== userId) return false;
      } else {
        if (c.status !== filter) return false;
      }
    }
    // 2. Filtro de canal (nuevo — no aplica cuando channelFilter === "all")
    if (channelFilter !== "all" && c.channel !== channelFilter) return false;

    return true;
  });

  return {
    conversations,
    filtered,
    filter,
    setFilter,
    searchQuery,
    setSearchQuery,
    isSearching,
    refresh,
  };
}
