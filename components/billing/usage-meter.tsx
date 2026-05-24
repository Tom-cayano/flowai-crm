"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UsageStatus } from "@/types/billing";

interface UsageMeterProps {
  workspaceId: string;
}

export function UsageMeter({ workspaceId }: UsageMeterProps) {
  const [status, setStatus] = useState<UsageStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/billing/usage?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((d: UsageStatus) => setStatus(d))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status) return null;

  const meters = [
    { key: "messages",    label: "Mensajes enviados",      limit: status.limits.messages    },
    { key: "aiCredits",   label: "Créditos IA usados",     limit: status.limits.aiCredits   },
    { key: "automations", label: "Automatizaciones",        limit: status.limits.automations },
    { key: "seats",       label: "Agentes activos",         limit: status.limits.seats       },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Uso este período</p>
          <p className="text-xs text-muted-foreground">
            Plan {status.plan.name} · {new Date(status.usage.periodStart).toLocaleDateString("es", { month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {meters.map(({ key, label, limit }) => (
          <div key={key}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-foreground/80">{label}</span>
                {limit.exceeded && (
                  <AlertTriangle className="h-3 w-3 text-red-400" />
                )}
              </div>
              <span className={cn(
                "text-xs font-medium",
                limit.pct >= 100 ? "text-red-400"
                : limit.pct >= 80 ? "text-amber-400"
                : "text-muted-foreground"
              )}>
                {limit.used.toLocaleString()} / {limit.limit >= 99999 ? "∞" : limit.limit.toLocaleString()}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  limit.pct >= 100 ? "bg-red-500"
                  : limit.pct >= 80 ? "bg-amber-500"
                  : undefined
                )}
                style={{
                  width: `${Math.min(100, limit.pct)}%`,
                  ...(limit.pct < 80 && { backgroundColor: "var(--brand)" }),
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
