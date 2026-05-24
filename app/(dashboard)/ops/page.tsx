import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { getWorkspaceSubscription } from "@/lib/billing/subscriptions";
import { QueueMonitor }       from "@/components/ops/queue-monitor";
import { FailedJobsList }     from "@/components/ops/failed-jobs-list";
import { SystemHealth }       from "@/components/ops/system-health";
import { AutomationAnalytics } from "@/components/ops/automation-analytics";

export const dynamic = "force-dynamic";

export default async function OpsPage() {
  // Ops dashboard is Pro+ only — check plan before rendering
  const supabase    = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspaceId = await getUserPrimaryWorkspace(user.id);
  if (workspaceId) {
    const sub = await getWorkspaceSubscription(workspaceId);
    const rank: Record<string, number> = { starter: 0, pro: 1, agency: 2, enterprise: 3 };
    if (sub && (rank[sub.planId] ?? 0) < rank["pro"]) {
      redirect("/dashboard?upgrade=ops");
    }
  }
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Operations</h1>
        <p className="text-sm text-muted-foreground">
          Queue health, worker status, failed jobs, and automation analytics.
        </p>
      </div>

      {/* Top row: health + analytics side by side */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Suspense>
            <SystemHealth />
          </Suspense>
        </div>
        <div className="lg:col-span-2">
          <Suspense>
            <AutomationAnalytics />
          </Suspense>
        </div>
      </div>

      {/* Queue cards */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
          Queue Monitor
        </h2>
        <Suspense>
          <QueueMonitor />
        </Suspense>
      </section>

      {/* DLQ */}
      <section>
        <Suspense>
          <FailedJobsList />
        </Suspense>
      </section>
    </div>
  );
}
