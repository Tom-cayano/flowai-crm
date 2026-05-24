const weekData = [
  { day: "Lun", messages: 620, conversations: 34 },
  { day: "Mar", messages: 890, conversations: 48 },
  { day: "Mié", messages: 740, conversations: 41 },
  { day: "Jue", messages: 1100, conversations: 62 },
  { day: "Vie", messages: 980, conversations: 55 },
  { day: "Sáb", messages: 450, conversations: 28 },
  { day: "Dom", messages: 320, conversations: 19 },
];

const maxMessages = Math.max(...weekData.map((d) => d.messages));

const summary = [
  { label: "Total mensajes", value: "5.100" },
  { label: "Media / día", value: "728" },
  { label: "Día pico", value: "Jueves" },
];

export function QuickStatsChart() {
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
        {weekData.map((d) => {
          const heightPct = (d.messages / maxMessages) * 100;
          return (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="w-full flex flex-col justify-end flex-1 relative group">
                {/* Tooltip */}
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:flex items-center whitespace-nowrap bg-popover border border-border rounded-md px-2 py-1 shadow-md z-10">
                  <span className="text-[10px] font-semibold text-foreground">{d.messages.toLocaleString("es-ES")}</span>
                </div>
                {/* Bar bg */}
                <div className="w-full h-full rounded-sm bg-muted/40 absolute inset-0" />
                {/* Bar fill */}
                <div
                  className="w-full rounded-sm bg-[#10b981] relative transition-all duration-300 group-hover:bg-[#34d399]"
                  style={{ height: `${heightPct}%`, opacity: 0.75 + (heightPct / 100) * 0.25 }}
                />
              </div>
              <span className="text-[9px] font-medium text-muted-foreground">{d.day}</span>
            </div>
          );
        })}
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
