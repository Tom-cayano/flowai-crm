"use client";

import { useState, useEffect, useCallback } from "react";
import type { AIReplyDraft } from "@/lib/ai/draft-manager";

interface UseAIDraftsReturn {
  draft: AIReplyDraft | null;
  drafts: AIReplyDraft[];
  isLoading: boolean;
  error: string | null;
  approveDraft: (id: string) => Promise<{ success: boolean; error?: string }>;
  rejectDraft: (id: string, note?: string) => Promise<{ success: boolean; error?: string }>;
  refresh: () => Promise<void>;
}

export function useAIDrafts(conversationId?: string): UseAIDraftsReturn {
  const [draft, setDraft] = useState<AIReplyDraft | null>(null);
  const [drafts, setDrafts] = useState<AIReplyDraft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDrafts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const url = conversationId
        ? `/api/ai/auto-reply/drafts?conversationId=${conversationId}`
        : `/api/ai/auto-reply/drafts`;
      
      const res = await fetch(url);
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Failed to fetch drafts");

      if (conversationId) {
        setDraft(data.draft || null);
      } else {
        setDrafts(data.drafts || []);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchDrafts();
    
    // Auto-refresh every 30s for inbox polling, though realistically we'd use Supabase Realtime
    const interval = setInterval(fetchDrafts, 30000);
    return () => clearInterval(interval);
  }, [fetchDrafts]);

  const approveDraft = async (id: string) => {
    try {
      const res = await fetch(`/api/ai/auto-reply/drafts/${id}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to approve");
      await fetchDrafts();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const rejectDraft = async (id: string, note?: string) => {
    try {
      const res = await fetch(`/api/ai/auto-reply/drafts/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reject");
      await fetchDrafts();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  return {
    draft,
    drafts,
    isLoading,
    error,
    approveDraft,
    rejectDraft,
    refresh: fetchDrafts
  };
}
