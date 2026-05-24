"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface UseTypingIndicatorOptions {
  conversationId: string;
  userId: string;
}

interface UseTypingIndicatorReturn {
  isContactTyping: boolean;
  sendTyping: () => void;
}

// How long (ms) to keep the "contact is typing" indicator visible after last event
const TYPING_EXPIRY_MS = 3_500;
// Minimum gap between typing broadcasts to avoid flooding (ms)
const SEND_THROTTLE_MS = 2_000;

export function useTypingIndicator({
  conversationId,
  userId,
}: UseTypingIndicatorOptions): UseTypingIndicatorReturn {
  const [isContactTyping, setIsContactTyping] = useState(false);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<number>(0);

  // ── Subscribe to typing broadcast from contact ────────────────────────────
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`typing:${conversationId}`)
      .on("broadcast", { event: "typing" }, (payload) => {
        // Ignore own broadcasts
        if ((payload.payload as Record<string, unknown>)?.userId === userId) return;

        setIsContactTyping(true);

        // Auto-clear after expiry
        if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
        expiryTimerRef.current = setTimeout(() => {
          setIsContactTyping(false);
        }, TYPING_EXPIRY_MS);
      })
      .subscribe();

    return () => {
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [conversationId, userId]);

  // ── Send typing signal (throttled) ───────────────────────────────────────
  const sendTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastSentRef.current < SEND_THROTTLE_MS) return;
    lastSentRef.current = now;

    // Fire-and-forget — POST to the typing API route
    fetch(`/api/conversations/${conversationId}/typing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    }).catch(() => {
      // Non-critical — typing indicators are ephemeral
    });
  }, [conversationId, userId]);

  return { isContactTyping, sendTyping };
}
