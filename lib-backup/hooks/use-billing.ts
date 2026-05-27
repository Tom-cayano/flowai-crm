"use client";

// Client hook — fetches subscription + usage for a workspace.
// Keeps the billing state in sync without a full page refresh.
// Usage data is refreshed every 60 s so quotas stay reasonably current.

import { useState, useEffect, useCallback } from "react";
import type { UsageStatus } from "@/types/billing";

export interface BillingState {
  usage:    UsageStatus | null;
  loading:  boolean;
  error:    string | null;
  refresh:  () => void;
}

export function useBilling(workspaceId: string | null): BillingState {
  const [usage,   setUsage]   = useState<UsageStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    try {
      setError(null);
      const res = await fetch(`/api/billing/usage?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as UsageStatus;
      setUsage(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void fetch_();
    const interval = setInterval(() => void fetch_(), 60_000);
    return () => clearInterval(interval);
  }, [fetch_]);

  return { usage, loading, error, refresh: fetch_ };
}

// ─── Convenience derived values ────────────────────────────────────────────────

export function isNearLimit(pct: number): boolean {
  return pct >= 80 && pct < 100;
}

export function isAtLimit(pct: number): boolean {
  return pct >= 100;
}
