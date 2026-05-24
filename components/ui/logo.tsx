import { cn } from "@/lib/utils";

interface MarkProps {
  size?: number;
  className?: string;
}

// ─── FlowAI CRM — "Neural Hub" Mark ──────────────────────────────────────────
// Central AI core (large node) connected via elegant spokes to three outer
// conversation nodes. Represents: AI intelligence at the center, connecting
// contacts, conversations, and automations. Hub-and-spoke = premium data network.
// Inspired by: Figma, OpenAI, Rippling.

export function LogoMark({ size = 32, className }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="lm-g" x1="5" y1="23" x2="27" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>

      {/* Outer halo ring — subtle AI glow around the core */}
      <circle
        cx="16" cy="15"
        r="7.5"
        stroke="url(#lm-g)"
        strokeWidth="0.75"
        strokeOpacity="0.22"
        fill="none"
      />

      {/* Spoke: core → top node */}
      <line x1="16" y1="11" x2="16" y2="8" stroke="url(#lm-g)" strokeWidth="1.5" strokeLinecap="round" />
      {/* Spoke: core → bottom-right node */}
      <line x1="19.3" y1="17.2" x2="22.9" y2="19.6" stroke="url(#lm-g)" strokeWidth="1.5" strokeLinecap="round" />
      {/* Spoke: core → bottom-left node */}
      <line x1="12.7" y1="17.2" x2="9.1" y2="19.6" stroke="url(#lm-g)" strokeWidth="1.5" strokeLinecap="round" />

      {/* Outer nodes */}
      <circle cx="16" cy="5.5" r="2.5" fill="url(#lm-g)" />
      <circle cx="25" cy="21.5" r="2.5" fill="#06b6d4" />
      <circle cx="7" cy="21.5" r="2.5" fill="#10b981" />

      {/* Central AI core */}
      <circle cx="16" cy="15" r="4" fill="url(#lm-g)" />
    </svg>
  );
}

// Monochrome version (for dark/light contexts where gradient doesn't work)
export function LogoMarkMono({ size = 32, className }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <circle cx="16" cy="15" r="7.5" stroke="currentColor" strokeWidth="0.75" strokeOpacity="0.2" fill="none" />
      <line x1="16" y1="11" x2="16" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6" />
      <line x1="19.3" y1="17.2" x2="22.9" y2="19.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6" />
      <line x1="12.7" y1="17.2" x2="9.1" y2="19.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6" />
      <circle cx="16" cy="5.5" r="2.5" fill="currentColor" fillOpacity="0.7" />
      <circle cx="25" cy="21.5" r="2.5" fill="currentColor" fillOpacity="0.5" />
      <circle cx="7" cy="21.5" r="2.5" fill="currentColor" fillOpacity="0.7" />
      <circle cx="16" cy="15" r="4" fill="currentColor" />
    </svg>
  );
}

interface LogoProps {
  collapsed?: boolean;
  className?: string;
  size?: number;
}

export function Logo({ collapsed = false, className, size = 28 }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      {!collapsed && (
        <span className="font-semibold text-[13px] tracking-tight leading-none text-sidebar-foreground">
          Flow
          <span className="bg-gradient-to-r from-[#10b981] to-[#06b6d4] bg-clip-text text-transparent">
            AI
          </span>
          <span className="font-normal text-muted-foreground/70"> CRM</span>
        </span>
      )}
    </div>
  );
}

export function LogoFull({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <LogoMark size={34} />
      <div className="flex flex-col">
        <span className="font-semibold text-[15px] tracking-tight leading-tight text-foreground">
          Flow
          <span className="bg-gradient-to-r from-[#10b981] to-[#06b6d4] bg-clip-text text-transparent">
            AI
          </span>
        </span>
        <span className="text-[10px] font-medium text-muted-foreground leading-tight tracking-widest uppercase">
          CRM
        </span>
      </div>
    </div>
  );
}
