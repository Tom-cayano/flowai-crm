"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { mapRealtimeConversation } from "@/lib/conversations-mapper";
import { getConversations, searchConversations } from "@/lib/actions/conversations";
import type { Conversation, ConversationStatus } from "@/types";

export type InboxFilter = ConversationStatus | "all" | "mine";

interface UseRealtimeInboxOptions {
  initialConversations: Conversation[];
  userId: string;
}

interface UseRealtimeInboxReturn {
  conversations: Conversation[];
  filtered: Conversation[];
  filter: InboxFilter;
  setFilter: (f: InboxFilter) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isSearching: boolean;
  refresh: () => Promise<void>;
}

export function useRealtimeInbox({
  initialConversations,
  userId,
}: UseRealtimeInboxOptions): UseRealtimeInboxReturn {
  const [conversations, setConversations] =
    useState<Conversation[]>(initialConversations);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Conversation[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Sync when Server Component re-renders with fresh data
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

  // ── Debounced FTS search ──────────────────────────────────────────────────
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

  // ── Realtime: conversation UPDATE (last_message, status, unread_count) ────
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`inbox:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updated = mapRealtimeConversation(
            payload.new as Record<string, unknown>
          );
          setConversations((prev) => {
            const next = prev.map((c) => (c.id === updated.id ? updated : c));
            return [...next].sort(
              (a, b) =>
                new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversations",
          filter: `user_id=eq.${userId}`,
        },
        async () => {
          // Refetch on insert — new conversation rows need the full denorm shape
          await refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  // ── Client-side filter (applied on top of FTS results or full list) ───────
  const source = searchResults ?? conversations;
  const filtered = source.filter((c) => {
    if (filter === "all") return true;
    if (filter === "mine") return c.assignedTo === userId;
    return c.status === filter;
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
