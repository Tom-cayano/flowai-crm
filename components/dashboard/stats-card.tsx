import { type LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  change: number;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  suffix?: string;
}

export function StatsCard({
  title,
  value,
  change,
  icon: Icon,
  iconColor = "text-[#10b981]",
  iconBg = "bg-[#10b981]/10",
  suffix,
}: StatsCardProps) {
  const isPositive = change >= 0;

  return (
    <div className="relative rounded-xl border border-border bg-card p-5 overflow-hidden transition-all duration-200 hover:border-white/[0.12] group">
      {/* Subtle top-left glow */}
      <div className="absolute -top-6 -left-6 h-16 w-16 rounded-full blur-2xl opacity-0 group-hover:opacity-40 transition-opacity duration-300 bg-[#10b981]" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.08em] mb-2">
            {title}
          </p>
          <p className="text-[28px] font-bold text-foreground tabular-nums leading-none">
            {value}
            {suffix && (
              <span className="text-xl font-semibold text-muted-foreground ml-0.5">{suffix}</span>
            )}
          </p>
        </div>

        <div className={cn("flex items-center justify-center h-10 w-10 rounded-xl shrink-0", iconBg)}>
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
      </div>

      <div className="relative flex items-center gap-1.5 mt-4 pt-4 border-t border-border/60">
        {isPositive ? (
          <TrendingUp className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        ) : (
          <TrendingDown className="h-3.5 w-3.5 text-red-400 shrink-0" />
        )}
        <span
          className={cn(
            "text-[12px] font-semibold tabular-nums",
            isPositive ? "text-emerald-500" : "text-red-400"
          )}
        >
          {isPositive ? "+" : ""}
          {change}%
        </span>
        <span className="text-[11px] text-muted-foreground">vs. mes anterior</span>
      </div>
    </div>
  );
}
