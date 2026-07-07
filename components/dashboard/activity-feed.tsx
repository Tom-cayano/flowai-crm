import { UserPlus, Zap, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActivityItem } from "@/lib/dashboard/stats";

// Actividad real reciente (contactos nuevos, mensajes entrantes y
// automatizaciones ejecutadas) — datos de dashboard_stats().

const iconMap: Record<string, React.ElementType> = {
  new_contact:  UserPlus,
  conversation: MessageCircle,
  automation:   Zap,
};

const colorMap: Record<string, { bg: string; text: string }> = {
  new_contact:  { bg: "bg-blue-500/10",  text: "text-blue-400" },
  conversation: { bg: "bg-[#10b981]/10", text: "text-[#10b981]" },
  automation:   { bg: "bg-amber-500/10", text: "text-amber-400" },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "hace un momento";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[13px] font-semibold text-foreground">Actividad reciente</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Últimos eventos del CRM</p>
        </div>
      </div>

      <div className="flex-1 space-y-0">
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground">Sin actividad reciente.</p>
        )}
        {items.map((item, idx) => {
          const Icon   = iconMap[item.type] ?? MessageCircle;
          const colors = colorMap[item.type] ?? { bg: "bg-muted", text: "text-muted-foreground" };
          const isLast = idx === items.length - 1;

          return (
            <div key={`${item.ts}-${idx}`} className="flex items-start gap-3 relative">
              {!isLast && (
                <div className="absolute left-[13px] top-7 bottom-0 w-px bg-border/60" />
              )}

              <div
                className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-lg shrink-0 mt-0.5",
                  colors.bg
                )}
              >
                <Icon className={cn("w-3.5 h-3.5", colors.text)} />
              </div>

              <div className={cn("flex-1 min-w-0 pb-4", isLast && "pb-0")}>
                <p className="text-[12px] text-foreground leading-snug">{item.text}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{relativeTime(item.ts)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
