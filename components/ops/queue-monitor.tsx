"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { QueueSnapshot } from "@/lib/observability/metrics";

interface QueueData {
  snapshots: QueueSnapshot[];
}

function StatPill({ label, value, variant = "default" }: {
  label:    string;
  value:    number;
  variant?: "default" | "warn" | "danger";
}) {
  const colors = {
    default: "bg-muted text-muted-foreground",
    warn:    "bg-amber-500/15 text-amber-400",
    danger:  "bg-red-500/15 text-red-400",
  };
  return (
    <div className={`rounded px-2 py-1 text-center ${colors[variant]}`}>
      <p className="text-[10px] uppercase tracking-wide">{label}</p>
      <p className="font-mono text-sm font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}

function QueueCard({ s }: { s: QueueSnapshot }) {
  const short = s.queueName.replace("wpp:", "");
  const busy   = s.waiting + s.active + s.delayed;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-mono">{short}</CardTitle>
          {s.avgLatencyMs !== null && (
            <span className="text-[10px] text-muted-foreground">
              avg {s.avgLatencyMs}ms
            </span>
          )}
        </div>
        {s.throughput1h > 0 && (
          <p className="text-[10px] text-muted-foreground">
            {s.throughput1h.toLocaleString()} jobs/h
          </p>
        )}
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="grid grid-cols-5 gap-1">
          <StatPill label="wait"  value={s.waiting}   variant={s.waiting   > 100 ? "warn"   : "default"} />
          <StatPill label="run"   value={s.active}    variant={s.active    > 20  ? "warn"   : "default"} />
          <StatPill label="done"  value={s.completed} />
          <StatPill label="delay" value={s.delayed}   variant={s.delayed   > 50  ? "warn"   : "default"} />
          <StatPill label="fail"  value={s.failed}    variant={s.failed    > 0   ? "danger" : "default"} />
        </div>
        {busy === 0 && s.failed === 0 && (
          <p className="mt-2 text-center text-[10px] text-muted-foreground italic">idle</p>
        )}
      </CardContent>
    </Card>
  );
}

export function QueueMonitor() {
  const [data, setData]       = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/queues");
      if (res.ok) setData(await res.json());
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Card key={i} className="h-28 animate-pulse bg-muted/30" />
        ))}
      </div>
    );
  }

  if (!data?.snapshots.length) {
    return <p className="text-sm text-muted-foreground">No queue data yet.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {data.snapshots.map((s) => <QueueCard key={s.queueName} s={s} />)}
    </div>
  );
}
