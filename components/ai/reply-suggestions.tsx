"use client";

/**
 * ReplySuggestions — AI quick-reply chips shown below the chat input.
 *
 * UX: Intercom / HubSpot / Linear style.
 * - Chips appear below the textarea (always visible, not a collapsible panel)
 * - Click on a chip → inserts text into the textarea via onInsert()
 * - Regenerate button refreshes suggestions from the API
 * - Loading skeleton while fetching
 * - Respects dark mode, mobile layout, and existing design tokens
 *
 * Props:
 *   conversationId  — current conversation (used for API call + cache)
 *   lastContactMsg  — latest message from the contact (triggers re-fetch)
 *   onInsert        — callback to set the textarea value (same as copilot panel)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReplySuggestion {
  text:  string;
  emoji: string;
}

interface ReplySuggestionsProps {
  conversationId: string;
  lastContactMsg: string;
  onInsert:       (text: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReplySuggestions({
  conversationId,
  lastContactMsg,
  onInsert,
}: ReplySuggestionsProps) {
  const [suggestions, setSuggestions]   = useState<ReplySuggestion[]>([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(false);
  const [clickedIdx, setClickedIdx]     = useState<number | null>(null);
  const prevMsgRef                      = useRef<string>("");
  const abortRef                        = useRef<AbortController | null>(null);

  // ── Fetch suggestions ────────────────────────────────────────────────────
  const fetchSuggestions = useCallback(async (forceRefresh = false) => {
    if (!lastContactMsg.trim()) {
      setSuggestions([]);
      return;
    }

    // Abort any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(false);

    try {
      const res = await fetch("/api/ai/reply-suggestions", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ conversationId, lastMessage: lastContactMsg, forceRefresh }),
        signal:  abortRef.current.signal,
      });

      if (!res.ok) {
        setError(true);
        setSuggestions([]);
        return;
      }

      const data = await res.json() as { suggestions?: ReplySuggestion[] };
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(true);
        setSuggestions([]);
      }
    } finally {
      setLoading(false);
    }
  }, [conversationId, lastContactMsg]);

  // ── Re-fetch when last contact message changes ───────────────────────────
  useEffect(() => {
    if (lastContactMsg && lastContactMsg !== prevMsgRef.current) {
      prevMsgRef.current = lastContactMsg;
      void fetchSuggestions();
    }
    return () => abortRef.current?.abort();
  }, [lastContactMsg, fetchSuggestions]);

  // ── Click: insert + flash feedback ───────────────────────────────────────
  const handleClick = useCallback((text: string, idx: number) => {
    onInsert(text);
    setClickedIdx(idx);
    setTimeout(() => setClickedIdx(null), 700);
  }, [onInsert]);

  // ── Nothing to show ───────────────────────────────────────────────────────
  if (!lastContactMsg.trim()) return null;

  return (
    <div className="px-4 pb-2">
      {/* Header row */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <Sparkles className="h-3 w-3 text-[#10b981] shrink-0" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide select-none">
          Sugerencias IA
        </span>
        <button
          onClick={() => fetchSuggestions(true)}
          disabled={loading}
          title="Regenerar sugerencias"
          className={cn(
            "ml-auto h-4 w-4 flex items-center justify-center rounded text-muted-foreground",
            "hover:text-foreground transition-colors disabled:opacity-40"
          )}
          aria-label="Regenerar sugerencias IA"
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
        </button>
      </div>

      {/* Chips */}
      <AnimatePresence mode="wait">
        {loading ? (
          /* Skeleton chips */
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex flex-wrap gap-1.5"
          >
            {[84, 112, 96].map((w, i) => (
              <div
                key={i}
                className="h-7 rounded-full bg-muted animate-pulse"
                style={{ width: w }}
                aria-hidden="true"
              />
            ))}
          </motion.div>
        ) : error ? (
          /* Error state — silent, don't break layout */
          <motion.p
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-[11px] text-muted-foreground/60"
          >
            No se pudieron cargar las sugerencias.
          </motion.p>
        ) : suggestions.length > 0 ? (
          /* Suggestion chips */
          <motion.div
            key="chips"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.18 }}
            className="flex flex-wrap gap-1.5"
          >
            {suggestions.map((s, idx) => (
              <motion.button
                key={`${s.text}-${idx}`}
                onClick={() => handleClick(s.text, idx)}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.04, duration: 0.15 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className={cn(
                  // Base chip styles — Apple / Linear aesthetic
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full",
                  "text-[11px] font-medium leading-none whitespace-nowrap",
                  "border transition-all duration-150 select-none",
                  "max-w-[240px] truncate",
                  // Default state
                  "bg-muted/60 border-border text-foreground/80",
                  "hover:bg-[#10b981]/10 hover:border-[#10b981]/40 hover:text-[#10b981]",
                  // Clicked flash
                  clickedIdx === idx &&
                    "bg-[#10b981]/20 border-[#10b981]/60 text-[#10b981]"
                )}
                aria-label={`Insertar: ${s.text}`}
                id={`reply-chip-${conversationId}-${idx}`}
              >
                <span aria-hidden="true">{s.emoji}</span>
                <span className="truncate">{s.text}</span>
              </motion.button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
