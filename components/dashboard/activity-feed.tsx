import {
  UserPlus,
  Megaphone,
  CheckCircle2,
  Zap,
  PauseCircle,
  MessageCircle,
} from "lucide-react";
import { recentActivity } from "@/data/mock-data";
import { cn } from "@/lib/utils";

const iconMap: Record<string, React.ElementType> = {
  "user-plus": UserPlus,
  megaphone: Megaphone,
  "check-circle": CheckCircle2,
  zap: Zap,
  "pause-circle": PauseCircle,
  "message-circle": MessageCircle,
};

const colorMap: Record<string, { bg: string; text: string }> = {
  new_contact: { bg: "bg-blue-500/10", text: "text-blue-400" },
  campaign: { bg: "bg-violet-500/10", text: "text-violet-400" },
  conversation: { bg: "bg-[#10b981]/10", text: "text-[#10b981]" },
  automation: { bg: "bg-amber-500/10", text: "text-amber-400" },
};

export function ActivityFeed() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[13px] font-semibold text-foreground">Actividad reciente</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Últimas acciones del equipo</p>
        </div>
      </div>

      <div className="flex-1 space-y-0">
        {recentActivity.map((item, idx) => {
          const Icon = iconMap[item.icon] ?? MessageCircle;
          const colors = colorMap[item.type] ?? { bg: "bg-muted", text: "text-muted-foreground" };
          const isLast = idx === recentActivity.length - 1;

          return (
            <div key={item.id} className="flex items-start gap-3 relative">
              {/* Vertical connector */}
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
                <p className="text-[10px] text-muted-foreground mt-1">{item.time}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
