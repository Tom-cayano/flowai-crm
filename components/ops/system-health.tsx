"use client";

// System health card — renders GET /api/ops/health.
//
// API contract (app/api/ops/health/route.ts):
//   { ok: boolean, ts: string, checks: Record<string, CheckResult> }
//   CheckResult = { ok, latencyMs?, detail?, error? }
//
// This component previously expected a different shape ({status, redis,
// workers…}) and crashed the whole /ops page with a client-side TypeError.
// It now renders the real contract defensively: unknown/missing fields
// never throw.

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CheckResult {
  ok:         boolean;
  latencyMs?: number;
  detail?:    string;
  error?:     string;
}

interface HealthData {
  ok:     boolean;
  ts:     string;
  checks: Record<string, CheckResult>;
}

const CHECK_LABELS: Record<string, string> = {
  envVars:   "Variables de entorno",
  supabase:  "Supabase",
  redis:     "Redis",
  evolution: "Evolution API",
  whatsapp:  "Sesión WhatsApp",
};

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full shrink-0 ${ok ? "bg-emerald-400" : "bg-red-400"}`}
    />
  );
}

export function SystemHealth() {
  const [data, setData]       = useState<HealthData | null>(null);
  const [failed, setFailed]   = useState(false);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/health");
      if (res.ok || res.status === 503) {
        const json = (await res.json()) as HealthData;
        setData(json && typeof json === "object" ? json : null);
        setFailed(false);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
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
        <CardContent className="text-xs text-muted-foreground">Cargando…</CardContent>
      </Card>
    );
  }

  if (!data || !data.checks) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm">System Health</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          {failed ? "No se pudo consultar /api/ops/health" : "Sin datos de salud disponibles"}
        </CardContent>
      </Card>
    );
  }

  const entries  = Object.entries(data.checks);
  const okCount  = entries.filter(([, c]) => c?.ok).length;
  const healthy  = data.ok;
  const badge    = healthy
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    : okCount > 0
      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
      : "bg-red-500/15 text-red-400 border-red-500/30";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">System Health</CardTitle>
          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${badge}`}>
            {healthy ? "healthy" : `${okCount}/${entries.length} ok`}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 text-xs">
        {entries.map(([key, check]) => (
          <div key={key} className="flex items-start gap-2">
            <span className="mt-1"><Dot ok={!!check?.ok} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-foreground">{CHECK_LABELS[key] ?? key}</span>
                {typeof check?.latencyMs === "number" && (
                  <span className="ml-auto text-muted-foreground shrink-0">{check.latencyMs}ms</span>
                )}
              </div>
              {(check?.detail || check?.error) && (
                <p className={`truncate text-[10px] ${check?.error ? "text-red-400" : "text-muted-foreground"}`}>
                  {check?.error ?? check?.detail}
                </p>
              )}
            </div>
          </div>
        ))}
        {data.ts && (
          <p className="pt-1 text-[10px] text-muted-foreground">
            Última comprobación: {new Date(data.ts).toLocaleTimeString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
