"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface HealthData {
  status:   "healthy" | "degraded" | "unhealthy";
  redis:    { ok: boolean; latencyMs: number };
  supabase: { ok: boolean; latencyMs: number };
  workers: {
    alive:   number;
    stale:   number;
    details: Array<{ workerId: string; lastBeat: string; queues: string[] }>;
  };
}

const STATUS_STYLES: Record<HealthData["status"], string> = {
  healthy:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  degraded:  "bg-amber-500/15  text-amber-400  border-amber-500/30",
  unhealthy: "bg-red-500/15    text-red-400    border-red-500/30",
};

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`}
    />
  );
}

function secondsAgo(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function SystemHealth() {
  const [data, setData]       = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/health");
      if (res.ok || res.status === 503) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch_();
    const t = setInterval(fetch_, 30_000);
    return () => clearInterval(t);
  }, [fetch_]);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm">System Health</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">System Health</CardTitle>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[data.status]}`}>
            {data.status}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        {/* Services */}
        <div className="space-y-1.5">
          <p className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">Services</p>
          <div className="flex items-center gap-2">
            <Dot ok={data.redis.ok} />
            <span className="text-foreground">Redis</span>
            <span className="ml-auto text-muted-foreground">{data.redis.latencyMs}ms</span>
          </div>
          <div className="flex items-center gap-2">
            <Dot ok={data.supabase.ok} />
            <span className="text-foreground">Supabase</span>
            <span className="ml-auto text-muted-foreground">{data.supabase.latencyMs}ms</span>
          </div>
        </div>

        {/* Workers */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="font-medium text-muted-foreground uppercase tracking-wide text-[10px]">Workers</p>
            <div className="flex gap-2">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {data.workers.alive} alive
              </Badge>
              {data.workers.stale > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                  {data.workers.stale} stale
                </Badge>
              )}
            </div>
          </div>
          {data.workers.details.map((w) => {
            const age = Date.now() - new Date(w.lastBeat).getTime();
            const isStale = age > 90_000;
            return (
              <div key={w.workerId} className="flex items-start gap-2">
                <Dot ok={!isStale} />
                <div className="min-w-0">
                  <p className="truncate font-mono text-[10px] text-foreground">{w.workerId}</p>
                  <p className="text-muted-foreground">{secondsAgo(w.lastBeat)}</p>
                </div>
              </div>
            );
          })}
          {data.workers.details.length === 0 && (
            <p className="text-muted-foreground italic">No workers registered</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
