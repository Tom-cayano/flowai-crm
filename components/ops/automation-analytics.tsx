"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

interface AutomationStat {
  id:              string;
  name:            string;
  status:          string;
  executionCount:  number;
  lastTriggeredAt: string | null;
  successRate:     number | null;
}

function StatRow({ stat }: { stat: AutomationStat }) {
  const statusColors: Record<string, string> = {
    active: "text-emerald-400",
    draft:  "text-muted-foreground",
    paused: "text-amber-400",
  };

  return (
    <div className="flex items-center gap-3 py-2 border-b border-border last:border-0 text-xs">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{stat.name}</p>
        <p className={`text-[10px] ${statusColors[stat.status] ?? "text-muted-foreground"}`}>
          {stat.status}
          {stat.lastTriggeredAt && (
            <> · last {new Date(stat.lastTriggeredAt).toLocaleDateString()}</>
          )}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="font-mono text-foreground">{stat.executionCount.toLocaleString()}</p>
        <p className="text-muted-foreground text-[10px]">runs</p>
      </div>
      {stat.successRate !== null && (
        <div className="text-right shrink-0 w-12">
          <p className={`font-mono ${stat.successRate < 80 ? "text-red-400" : "text-emerald-400"}`}>
            {stat.successRate}%
          </p>
          <p className="text-muted-foreground text-[10px]">ok</p>
        </div>
      )}
    </div>
  );
}

export function AutomationAnalytics() {
  const [stats, setStats]     = useState<AutomationStat[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    const supabase = createClient();
    const { data: automations } = await supabase
      .from("automations")
      .select("id, name, status, execution_count, last_triggered_at")
      .order("execution_count", { ascending: false })
      .limit(20);

    if (!automations) { setLoading(false); return; }

    // Fetch success rates from execution records (last 100 per automation)
    const withRates = await Promise.all(
      automations.map(async (a) => {
        const { data: execs } = await supabase
          .from("automation_executions")
          .select("status")
          .eq("automation_id", a.id)
          .order("started_at", { ascending: false })
          .limit(100);

        let successRate: number | null = null;
        if (execs && execs.length > 0) {
          const succeeded = execs.filter((e) => e.status === "completed").length;
          successRate = Math.round((succeeded / execs.length) * 100);
        }

        return {
          id:              a.id,
          name:            a.name,
          status:          a.status,
          executionCount:  a.execution_count ?? 0,
          lastTriggeredAt: a.last_triggered_at,
          successRate,
        };
      })
    );

    setStats(withRates);
    setLoading(false);
  }, []);

  useEffect(() => { void fetch_(); }, [fetch_]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Automation Analytics</CardTitle>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 rounded bg-muted/30 animate-pulse" />
            ))}
          </div>
        )}
        {!loading && stats.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground italic">
            No automations yet.
          </p>
        )}
        {stats.map((s) => <StatRow key={s.id} stat={s} />)}
      </CardContent>
    </Card>
  );
}
