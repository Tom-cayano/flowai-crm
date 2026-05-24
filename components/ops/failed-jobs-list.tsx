"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { JobFailureRow } from "@/lib/observability/dlq";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function FailureRow({
  failure,
  onReplay,
}: {
  failure:  JobFailureRow;
  onReplay: (id: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone]            = useState(!!failure.replayed_at);
  const [error, setError]          = useState<string | null>(null);
  const [open, setOpen]            = useState(false);

  function replay() {
    startTransition(async () => {
      try {
        await onReplay(failure.id);
        setDone(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Replay failed");
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 text-xs space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-foreground font-medium">{failure.job_name}</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {failure.queue_name.replace("wpp:", "")}
            </Badge>
            {done && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-emerald-500/15 text-emerald-400">
                replayed
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-0.5">
            {formatDate(failure.failed_at)} · {failure.attempts_made} attempt{failure.attempts_made !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide" : "Details"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-6 px-2 text-[10px]"
            disabled={pending || done}
            onClick={replay}
          >
            {pending ? "…" : done ? "Replayed" : "Replay"}
          </Button>
        </div>
      </div>

      {error && <p className="text-red-400">{error}</p>}

      {open && (
        <div className="space-y-1.5 border-t border-border pt-2">
          <p className="font-medium text-destructive">{failure.error}</p>
          {failure.stack_trace && (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-[10px] text-muted-foreground max-h-40">
              {failure.stack_trace}
            </pre>
          )}
          {failure.correlation_id && (
            <p className="text-muted-foreground font-mono">
              correlation: {failure.correlation_id}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function FailedJobsList() {
  const [failures, setFailures] = useState<JobFailureRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [queue, setQueue]       = useState<string>("all");

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/queues");
      if (res.ok) {
        const json = await res.json() as { failures: JobFailureRow[] };
        setFailures(json.failures);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetch_(); }, [fetch_]);

  async function handleReplay(id: string) {
    const res = await fetch("/api/ops/replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ failureId: id }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(json.error ?? "Replay failed");
    }
  }

  const queues  = ["all", ...Array.from(new Set(failures.map((f) => f.queue_name)))];
  const visible = queue === "all" ? failures : failures.filter((f) => f.queue_name === queue);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Failed Jobs (DLQ)</CardTitle>
          <span className="text-xs text-muted-foreground">{failures.length} total</span>
        </div>
        {queues.length > 1 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {queues.map((q) => (
              <button
                key={q}
                onClick={() => setQueue(q)}
                className={`rounded-full px-2 py-0.5 text-[10px] border transition-colors ${
                  queue === q
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-foreground/50"
                }`}
              >
                {q === "all" ? "All" : q.replace("wpp:", "")}
              </button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-lg bg-muted/30 animate-pulse" />)}
          </div>
        )}
        {!loading && visible.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground italic">
            No failed jobs — all clear.
          </p>
        )}
        {visible.map((f) => (
          <FailureRow key={f.id} failure={f} onReplay={handleReplay} />
        ))}
      </CardContent>
    </Card>
  );
}
