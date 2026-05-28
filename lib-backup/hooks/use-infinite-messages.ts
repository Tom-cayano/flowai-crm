"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { mapRealtimeMessage } from "@/lib/conversations-mapper";
import { getMessagesPage, markConversationRead } from "@/lib/actions/conversations";
import type { Message } from "@/types";

const INITIAL_LIMIT = 50;
const PAGE_LIMIT = 25;

interface UseInfiniteMessagesReturn {
  messages: Message[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  addOptimistic: (msg: Message) => void;
  confirmOptimistic: (tempId: string, real: Message) => void;
  removeOptimistic: (tempId: string) => void;
  updateMessage: (id: string, patch: Partial<Message>) => void;
}

export function useInfiniteMessages(
  conversationId: string
): UseInfiniteMessagesReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<string | null>(null);

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    setIsLoading(true);
    setMessages([]);
    cursorRef.current = null;
    setHasMore(false);

    getMessagesPage(conversationId, null, INITIAL_LIMIT).then((result) => {
      if (result.data) {
        setMessages(result.data.messages);
        setHasMore(result.data.hasMore);
        cursorRef.current = result.data.nextCursor;
      }
      setIsLoading(false);
    });

    markConversationRead(conversationId);
  }, [conversationId]);

  // ── Realtime new messages ────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const incoming = mapRealtimeMessage(
            payload.new as Record<string, unknown>
          );
          setMessages((prev) => {
            // Skip if already present (optimistic replacement or duplicate)
            if (prev.some((m) => m.id === incoming.id)) return prev;
            return [...prev, incoming];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = mapRealtimeMessage(
            payload.new as Record<string, unknown>
          );
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // ── Load older messages (infinite scroll upward) ─────────────────────────
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore || !cursorRef.current) return;

    setIsLoadingMore(true);
    const result = await getMessagesPage(
      conversationId,
      cursorRef.current,
      PAGE_LIMIT
    );
    if (result.data) {
      // Prepend older messages at the top
      setMessages((prev) => [...result.data!.messages, ...prev]);
      setHasMore(result.data.hasMore);
      cursorRef.current = result.data.nextCursor;
    }
    setIsLoadingMore(false);
  }, [conversationId, isLoadingMore, hasMore]);

  // ── Optimistic helpers ───────────────────────────────────────────────────
  const addOptimistic = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const confirmOptimistic = useCallback((tempId: string, real: Message) => {
    setMessages((prev) => {
      const alreadyPresent = prev.some((m) => m.id === real.id);
      if (alreadyPresent) return prev.filter((m) => m.id !== tempId);
      return prev.map((m) => (m.id === tempId ? real : m));
    });
  }, []);

  const removeOptimistic = useCallback((tempId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== tempId));
  }, []);

  const updateMessage = useCallback((id: string, patch: Partial<Message>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  }, []);

  return {
    messages,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    addOptimistic,
    confirmOptimistic,
    removeOptimistic,
    updateMessage,
  };
}
