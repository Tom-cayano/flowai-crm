import {
  Users,
  MessageSquare,
  Send,
  TrendingUp,
  Clock,
  Zap,
  ArrowRight,
} from "lucide-react";
import { StatsCard } from "@/components/dashboard/stats-card";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { QuickStatsChart } from "@/components/dashboard/quick-stats-chart";
import { TopContactsTable } from "@/components/dashboard/top-contacts-table";
import { mockDashboardStats } from "@/data/mock-data";

export default function DashboardPage() {
  const s = mockDashboardStats;

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
              <span className="text-[#10b981] font-semibold">{s.openTickets} tickets abiertos</span>
              {" "}y{" "}
              <span className="text-[#10b981] font-semibold">{s.activeConversations} conversaciones activas</span>
              {" "}hoy.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-6 shrink-0">
            <div className="text-right">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em]">
                Resp. media
              </p>
              <p className="text-xl font-bold text-[#10b981] tabular-nums">{s.avgResponseTime}</p>
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
          value={s.totalContacts.toLocaleString("es-ES")}
          change={s.contactsGrowth}
          icon={Users}
          iconColor="text-blue-400"
          iconBg="bg-blue-500/10"
        />
        <StatsCard
          title="Conversaciones activas"
          value={s.activeConversations}
          change={s.conversationsGrowth}
          icon={MessageSquare}
          iconColor="text-[#10b981]"
          iconBg="bg-[#10b981]/10"
        />
        <StatsCard
          title="Mensajes enviados"
          value={s.messagesSent.toLocaleString("es-ES")}
          change={s.messagesSentGrowth}
          icon={Send}
          iconColor="text-violet-400"
          iconBg="bg-violet-500/10"
        />
        <StatsCard
          title="Tasa de respuesta"
          value={s.responseRate}
          change={s.responseRateGrowth}
          icon={TrendingUp}
          iconColor="text-amber-400"
          iconBg="bg-amber-500/10"
          suffix="%"
        />
      </div>

      {/* Quick metrics row */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: "Tickets abiertos", value: s.openTickets, icon: TrendingUp, color: "text-red-400", bg: "bg-red-500/10" },
          { label: "Tiempo de respuesta", value: s.avgResponseTime, icon: Clock, color: "text-[#10b981]", bg: "bg-[#10b981]/10" },
          { label: "Automatizaciones activas", value: "4", icon: Zap, color: "text-violet-400", bg: "bg-violet-500/10" },
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

      {/* Chart + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <QuickStatsChart />
        </div>
        <ActivityFeed />
      </div>

      {/* Top contacts table */}
      <TopContactsTable />
    </div>
  );
}
