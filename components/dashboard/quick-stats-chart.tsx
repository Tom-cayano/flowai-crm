import type { DayPoint } from "@/lib/dashboard/stats";

// Actividad real de mensajes de los últimos 7 días — datos de dashboard_stats().

const DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function QuickStatsChart({ data }: { data: DayPoint[] }) {
  const days = data.map((d) => ({
    ...d,
    label: DAY_LABELS[new Date(`${d.day}T00:00:00`).getDay()] ?? d.day,
  }));

  const totalMessages = days.reduce((acc, d) => acc + d.total, 0);
  const maxMessages   = Math.max(1, ...days.map((d) => d.total));
  const avgPerDay     = days.length > 0 ? Math.round(totalMessages / days.length) : 0;
  const peak          = days.reduce<(typeof days)[number] | null>(
    (best, d) => (best === null || d.total > best.total ? d : best),
    null
  );

  const summary = [
    { label: "Total mensajes", value: totalMessages.toLocaleString("es-ES") },
    { label: "Media / día",    value: avgPerDay.toLocaleString("es-ES") },
    { label: "Día pico",       value: peak && peak.total > 0 ? peak.label : "—" },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-5 h-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[13px] font-semibold text-foreground">Mensajes esta semana</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Actividad de los últimos 7 días</p>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#10b981]" />
            Mensajes
          </span>
        </div>
      </div>

      {/* Bars */}
      <div className="flex items-end gap-1.5 h-32 mb-4">
        {days.map((d) => {
          const heightPct = (d.total / maxMessages) * 100;
          return (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="w-full flex flex-col justify-end flex-1 relative group">
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:flex items-center whitespace-nowrap bg-popover border border-border rounded-md px-2 py-1 shadow-md z-10">
                  <span className="text-[10px] font-semibold text-foreground">
                    {d.total.toLocaleString("es-ES")} msj · {d.conversations} conv
                  </span>
                </div>
                <div className="w-full h-full rounded-sm bg-muted/40 absolute inset-0" />
                <div
                  className="w-full rounded-sm bg-[#10b981] relative transition-all duration-300 group-hover:bg-[#34d399]"
                  style={{
                    height: `${Math.max(heightPct, d.total > 0 ? 4 : 0)}%`,
                    opacity: 0.75 + (heightPct / 100) * 0.25,
                  }}
                />
              </div>
              <span className="text-[9px] font-medium text-muted-foreground">{d.label}</span>
            </div>
          );
        })}
        {days.length === 0 && (
          <p className="text-xs text-muted-foreground m-auto">Sin actividad todavía</p>
        )}
      </div>

      {/* Summary row */}
      <div className="flex items-center justify-between border-t border-border/60 pt-4">
        {summary.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-[11px] text-muted-foreground mb-0.5">{s.label}</p>
            <p className="text-[13px] font-bold text-foreground tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
