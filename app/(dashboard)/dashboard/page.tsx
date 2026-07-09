import {
  Users,
  MessageSquare,
  Send,
  TrendingUp,
  Clock,
  Zap,
  Target,
  ArrowRight,
} from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getDashboardStats,
  growthPct,
  formatResponseTime,
} from "@/lib/dashboard/stats";
import { StatsCard } from "@/components/dashboard/stats-card";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { QuickStatsChart } from "@/components/dashboard/quick-stats-chart";
import { TopContactsTable } from "@/components/dashboard/top-contacts-table";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const s = await getDashboardStats(user.id);

  // Métricas derivadas (todo real, desde Supabase)
  const totalContacts    = s?.total_contacts ?? 0;
  const openConvs        = s?.conversations_open ?? 0;
  const pendingConvs     = s?.conversations_pending ?? 0;
  const messagesSent     = s?.messages_sent_30d ?? 0;
  const started          = s?.started_conversations ?? 0;
  const answered         = s?.answered_conversations ?? 0;
  const responseRate     = started > 0 ? Math.round((answered / started) * 1000) / 10 : 0;
  const avgResponseTime  = formatResponseTime(s?.avg_response_seconds ?? null);
  const automationsCount = s?.automations_active ?? 0;
  const leads30d         = s?.leads_30d ?? 0;

  return (
    <div className="p-5 sm:p-6 space-y-5 max-w-screen-2xl mx-auto">

      {/* Welcome banner */}
      <div className="relative rounded-xl border border-[#10b981]/15 bg-gradient-to-r from-[#10b981]/[0.06] via-[#10b981]/[0.03] to-transparent overflow-hidden p-5">
        <div className="absolute top-0 right-0 h-full w-1/3 bg-gradient-to-l from-[#06b6d4]/[0.04] to-transparent pointer-events-none" />
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">Buenos días 👋</h2>
            <p className="text-[13px] text-muted-foreground mt-1">
              Tienes{" "}
              <span className="text-[#10b981] font-semibold">{pendingConvs} conversaciones pendientes</span>
              {" "}y{" "}
              <span className="text-[#10b981] font-semibold">{openConvs} conversaciones abiertas</span>.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-6 shrink-0">
            <div className="text-right">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em]">
                Resp. media
              </p>
              <p className="text-xl font-bold text-[#10b981] tabular-nums">{avgResponseTime}</p>
            </div>
            <a
              href="/conversations"
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-lg bg-[#10b981] text-[#030712] text-[12px] font-semibold hover:bg-[#0ea572] transition-colors duration-150"
            >
              Ver bandeja
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatsCard
          title="Contactos totales"
          value={totalContacts.toLocaleString("es-ES")}
          change={growthPct(s?.contacts_30d ?? 0, s?.contacts_prev_30d ?? 0)}
          icon={Users}
          iconColor="text-blue-400"
          iconBg="bg-blue-500/10"
        />
        <StatsCard
          title="Conversaciones activas"
          value={openConvs}
          change={growthPct(s?.conversations_30d ?? 0, s?.conversations_prev_30d ?? 0)}
          icon={MessageSquare}
          iconColor="text-[#10b981]"
          iconBg="bg-[#10b981]/10"
        />
        <StatsCard
          title="Mensajes enviados (30 d)"
          value={messagesSent.toLocaleString("es-ES")}
          change={growthPct(messagesSent, s?.messages_sent_prev_30d ?? 0)}
          icon={Send}
          iconColor="text-violet-400"
          iconBg="bg-violet-500/10"
        />
        <StatsCard
          title="Tasa de respuesta"
          value={responseRate}
          change={0}
          icon={TrendingUp}
          iconColor="text-amber-400"
          iconBg="bg-amber-500/10"
          suffix="%"
        />
      </div>

      {/* Quick metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: "Conversaciones pendientes", value: pendingConvs,     icon: TrendingUp, color: "text-red-400",     bg: "bg-red-500/10" },
          { label: "Tiempo de respuesta",       value: avgResponseTime,  icon: Clock,      color: "text-[#10b981]",  bg: "bg-[#10b981]/10" },
          { label: "Automatizaciones activas",  value: automationsCount, icon: Zap,        color: "text-violet-400", bg: "bg-violet-500/10" },
          { label: "Leads nuevos (30 d)",       value: leads30d,         icon: Target,     color: "text-sky-400",    bg: "bg-sky-500/10" },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${m.bg}`}>
              <m.icon className={`h-4 w-4 ${m.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.07em] truncate">{m.label}</p>
              <p className="text-[15px] font-bold text-foreground tabular-nums">{m.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Métricas de email (30 d) — reales, de email_logs */}
      {(s?.email?.sent ?? 0) > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { label: "Emails enviados",  value: s!.email!.sent },
            { label: "Entregados",       value: s!.email!.delivered },
            { label: "Abiertos",         value: s!.email!.opened },
            { label: "Clicks",           value: s!.email!.clicked },
            { label: "CTR",              value: s!.email!.opened > 0 ? `${Math.round((s!.email!.clicked / s!.email!.opened) * 100)}%` : "0%" },
            { label: "Rebotes",          value: s!.email!.bounced },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-border bg-card p-3">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.07em] truncate">{m.label}</p>
              <p className="text-[15px] font-bold text-foreground tabular-nums">{m.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Chart + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <QuickStatsChart data={s?.messages_per_day ?? []} />
        </div>
        <ActivityFeed items={s?.recent_activity ?? []} />
      </div>

      {/* Top contacts table */}
      <TopContactsTable contacts={s?.top_contacts ?? []} />
    </div>
  );
}
