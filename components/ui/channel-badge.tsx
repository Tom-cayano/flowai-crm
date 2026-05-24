/**
 * ChannelBadge — Fuente única de verdad para identidad visual de canales.
 *
 * Renderiza un indicador visual (pill, icon, dot) para cualquier canal de
 * conversación. Centraliza colores, iconos SVG y labels en un único lugar.
 * Para añadir un canal nuevo: una entrada en CHANNEL_CONFIG — nada más cambia.
 *
 * API pública:
 *   <ChannelBadge channel="whatsapp" />                  → pill verde (icon + label)
 *   <ChannelBadge channel="instagram" variant="icon" />  → icono gradiente solo
 *   <ChannelBadge channel="messenger" variant="dot" />   → punto azul
 *   <ChannelBadge channel="whatsapp" size="xs" />        → pill más pequeño
 *
 * Gradient IDs: pasa `id` (conversation.id o índice de lista) cuando renderices
 * múltiples instancias para evitar colisiones de IDs SVG globales en el DOM.
 */

import { Mail, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Channel             = Conversation["channel"];
export type ChannelBadgeVariant = "pill" | "icon" | "dot";
export type ChannelBadgeSize    = "xs" | "sm" | "md" | "lg";

// ─── Channel config table ─────────────────────────────────────────────────────
// Única fuente de verdad. Añade canales futuros aquí — nada más cambia.
// Nota: no usar `as const` — gradientStops debe ser string[] mutable (ChannelConfig).

export interface ChannelConfig {
  /** Label visible en pills y aria-labels */
  label:          string;
  /** Fondo tintado sutil para variante pill (rgba recomendado) */
  bgColor:        string;
  /** Foreground: texto + relleno de icono monocromático */
  fgColor:        string;
  /** Cuando true el icono usa gradiente en vez de fgColor */
  gradient?:      boolean;
  /** Stops del gradiente [inicio → fin], usado cuando gradient=true */
  gradientStops?: string[];
}

export const CHANNEL_CONFIG: Record<Channel, ChannelConfig> = {
  whatsapp: {
    label:   "WhatsApp",
    bgColor: "rgba(37,211,102,0.12)",
    fgColor: "#25d366",
  },
  instagram: {
    label:         "Instagram",
    bgColor:       "rgba(214,41,118,0.12)",
    fgColor:       "#d62976",
    gradient:      true,
    gradientStops: ["#feda75", "#fa7e1e", "#d62976", "#962fbf", "#4f5bd5"],
  },
  messenger: {
    label:   "Messenger",
    bgColor: "rgba(0,132,255,0.12)",
    fgColor: "#0084ff",
  },
  email: {
    label:   "Email",
    bgColor: "rgba(113,113,122,0.12)",
    fgColor: "#71717a",
  },
  sms: {
    label:   "SMS",
    bgColor: "rgba(6,182,212,0.12)",
    fgColor: "#06b6d4",
  },
};

// ─── Size tokens ──────────────────────────────────────────────────────────────

interface SizeTokens {
  iconPx:    number;
  textClass: string;
  gapClass:  string;
  padClass:  string;
  dotClass:  string;
}

const SIZE_MAP: Record<ChannelBadgeSize, SizeTokens> = {
  xs: { iconPx:  8, textClass: "text-[8px]",  gapClass: "gap-[3px]", padClass: "px-1 py-px",      dotClass: "h-1 w-1"     },
  sm: { iconPx:  9, textClass: "text-[9px]",  gapClass: "gap-[3px]", padClass: "px-1.5 py-[3px]", dotClass: "h-1.5 w-1.5" },
  md: { iconPx: 10, textClass: "text-[10px]", gapClass: "gap-1",     padClass: "px-1.5 py-0.5",   dotClass: "h-2 w-2"     },
  lg: { iconPx: 12, textClass: "text-xs",     gapClass: "gap-1",     padClass: "px-2 py-1",        dotClass: "h-2.5 w-2.5" },
};

// ─── SVG Icons ────────────────────────────────────────────────────────────────

/**
 * WhatsApp: burbuja de chat redondeada con silueta de teléfono blanco.
 */
export function WhatsAppIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.656 1.438 5.164L2 22l4.977-1.41A9.944 9.944 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2Z"
        fill={color}
      />
      <path
        d="M8.5 8.5c.18-.47.56-.5.86-.5.19 0 .38 0 .54.02.17.02.38.09.56.57.2.5.66 1.58.71 1.7.06.11.1.23.02.38-.07.15-.1.24-.2.37l-.3.38c-.1.1-.2.21-.08.41.11.2.51.86 1.1 1.4.76.67 1.4.9 1.6 1 .2.1.32.08.44-.05.12-.14.5-.59.63-.79.14-.2.28-.16.47-.09.19.07 1.17.55 1.37.65.2.1.34.15.39.23.04.09.04.48-.12.93-.17.45-.97.88-1.34.93-.36.05-.69.08-2.27-.48-1.92-.68-3.14-2.61-3.24-2.73-.1-.12-.8-1.06-.8-2.03 0-.97.5-1.44.68-1.64Z"
        fill="white"
        fillRule="evenodd"
      />
    </svg>
  );
}

/**
 * Instagram: cuadrado redondeado con círculo y punto, trazo con gradiente de marca.
 */
export function InstagramIcon({
  size,
  gradientId,
}: {
  size:       number;
  gradientId: string;
}) {
  const stops = CHANNEL_CONFIG.instagram.gradientStops ?? [];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="100%" x2="100%" y2="0%">
          {stops.map((stop, i) => (
            <stop
              key={i}
              offset={`${(i / Math.max(stops.length - 1, 1)) * 100}%`}
              stopColor={stop}
            />
          ))}
        </linearGradient>
      </defs>
      <rect
        x="2" y="2" width="20" height="20" rx="6"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.8"
      />
      <circle
        cx="12" cy="12" r="4.5"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.8"
      />
      <circle
        cx="17.5" cy="6.5" r="1.1"
        fill={`url(#${gradientId})`}
      />
    </svg>
  );
}

/**
 * Messenger: burbuja de chat con flecha diagonal (rayo) característica de Meta.
 */
export function MessengerIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M12 3C6.918 3 3 6.84 3 11.5c0 2.673 1.22 5.064 3.158 6.702.14.12.223.295.228.484l.046 1.514a.625.625 0 0 0 .878.553l1.688-.745a.625.625 0 0 1 .416-.037C10.208 20.187 11.05 20 12 20c5.082 0 9-3.84 9-8.5C21 6.84 17.082 3 12 3Z"
        fill={color}
      />
      <path
        d="M6.5 14.25 9.95 9.1a.625.625 0 0 1 .897-.145l2.203 1.652a.208.208 0 0 0 .25 0l2.972-2.257c.396-.3.913.173.65.599L13.477 14.1a.625.625 0 0 1-.898.144l-2.203-1.652a.208.208 0 0 0-.25 0L7.15 14.849c-.397.3-.913-.173-.65-.599Z"
        fill="white"
      />
    </svg>
  );
}

/** Fallback para canales sin SVG de marca (email, sms) */
function FallbackIcon({
  size,
  color,
  channel,
}: {
  size:    number;
  color:   string;
  channel: Channel;
}): React.ReactElement {
  const style: React.CSSProperties = { width: size, height: size, color, flexShrink: 0 };
  if (channel === "email") return <Mail style={style} aria-hidden />;
  return <MessageSquare style={style} aria-hidden />;
}

// ─── Renderizador interno de icono ────────────────────────────────────────────

function ChannelIcon({
  channel,
  size,
  color,
  gradientId,
}: {
  channel:    Channel;
  size:       number;
  color:      string;
  gradientId: string;
}): React.ReactElement {
  switch (channel) {
    case "whatsapp":  return <WhatsAppIcon  size={size} color={color} />;
    case "instagram": return <InstagramIcon size={size} gradientId={gradientId} />;
    case "messenger": return <MessengerIcon size={size} color={color} />;
    default:          return <FallbackIcon  size={size} color={color} channel={channel} />;
  }
}

// ─── Componente público ───────────────────────────────────────────────────────

export interface ChannelBadgeProps {
  channel:    Channel;
  /**
   * "pill"  → icono + label con fondo tintado (default)
   * "icon"  → solo el icono SVG, sin fondo
   * "dot"   → punto circular de color
   */
  variant?:   ChannelBadgeVariant;
  /** xs | sm (default) | md | lg */
  size?:      ChannelBadgeSize;
  className?: string;
  /** Sobrescribe el label por defecto del canal */
  label?:     string;
  /**
   * Sufijo único para el ID del gradiente SVG interno.
   * Pasa `conversation.id` o un índice numérico cuando renderices múltiples
   * instancias simultáneas para evitar colisiones de IDs SVG globales en el DOM.
   */
  id?:        string | number;
}

export function ChannelBadge({
  channel,
  variant   = "pill",
  size      = "sm",
  className,
  label,
  id        = "default",
}: ChannelBadgeProps): React.ReactElement {
  const config       = CHANNEL_CONFIG[channel] ?? CHANNEL_CONFIG.whatsapp;
  const tokens       = SIZE_MAP[size];
  const gradientId   = `cbadge-${channel}-${String(id).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const displayLabel = label ?? config.label;

  // ── Variante dot ─────────────────────────────────────────────────────────
  if (variant === "dot") {
    return (
      <span
        className={cn("inline-block rounded-full shrink-0", tokens.dotClass, className)}
        style={
          config.gradient && config.gradientStops
            ? { background: `linear-gradient(135deg, ${config.gradientStops.join(", ")})` }
            : { backgroundColor: config.fgColor }
        }
        aria-label={displayLabel}
        title={displayLabel}
      />
    );
  }

  const icon = (
    <ChannelIcon
      channel={channel}
      size={tokens.iconPx}
      color={config.fgColor}
      gradientId={gradientId}
    />
  );

  // ── Variante icon (solo icono) ────────────────────────────────────────────
  if (variant === "icon") {
    return (
      <span
        className={cn("inline-flex items-center justify-center shrink-0", className)}
        aria-label={displayLabel}
        title={displayLabel}
      >
        {icon}
      </span>
    );
  }

  // ── Variante pill (default) ───────────────────────────────────────────────
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold leading-none shrink-0",
        tokens.padClass,
        tokens.gapClass,
        tokens.textClass,
        className
      )}
      style={{ backgroundColor: config.bgColor, color: config.fgColor }}
      aria-label={displayLabel}
      title={displayLabel}
    >
      {icon}
      {displayLabel}
    </span>
  );
}
