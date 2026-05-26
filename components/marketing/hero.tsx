"use client";

import React from "react";
import Link from "next/link";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
  type MotionValue,
} from "framer-motion";
import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  lineReveal,
  lineRevealSlow,
  fadeIn,
  fadeUpSm,
  scaleIn,
  mockupEntrance,
  staggerFast,
  staggerSlow,
} from "@/lib/motion/presets";
import { heroDelay } from "@/lib/motion/transitions";
import { HeroDashboardMockup } from "./hero-mockup";

// ─── Channel orbs data ────────────────────────────────────────────────────────

interface ChannelConfig {
  id: string;
  label: string;
  color: string;
  floatDelay: string;
  floatDuration: string;
  icon: React.ReactNode;
}

const channels: ChannelConfig[] = [
  {
    id: "wa",
    label: "WhatsApp",
    color: "#10b981",
    floatDelay: "0.3s",
    floatDuration: "4.2s",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.118 1.528 5.845L.057 23.5l5.82-1.527A11.952 11.952 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.645-.518-5.148-1.418l-.368-.217-3.457.906.924-3.368-.24-.389A9.953 9.953 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
      </svg>
    ),
  },
  {
    id: "ig",
    label: "Instagram",
    color: "#ec4899",
    floatDelay: "1.1s",
    floatDuration: "5.0s",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="6" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: "fb",
    label: "Messenger",
    color: "#3b82f6",
    floatDelay: "2.0s",
    floatDuration: "4.6s",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.31.27.51l.05 1.6c.04.51.57.82 1.04.6l1.79-.78c.15-.07.32-.08.48-.03.79.22 1.63.33 2.5.33 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm5.98 7.28l-2.93 4.65c-.47.73-1.47.92-2.17.4l-2.33-1.75c-.21-.16-.51-.16-.72 0l-3.14 2.38c-.42.32-.96-.17-.68-.62l2.93-4.65c.47-.73 1.47-.92 2.17-.4l2.33 1.75c.21.16.51.16.72 0l3.14-2.38c.42-.32.96.17.68.62z" />
      </svg>
    ),
  },
  {
    id: "tt",
    label: "TikTok",
    color: "#e4e4e7",
    floatDelay: "0.7s",
    floatDuration: "3.8s",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.34 6.34 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V9.05a8.18 8.18 0 0 0 4.78 1.52V7.12a4.85 4.85 0 0 1-1.01-.43z" />
      </svg>
    ),
  },
];

// ─── Trust stats ──────────────────────────────────────────────────────────────

const trustStats = [
  { value: "+3.200", label: "empresas activas" },
  { value: "98%",    label: "satisfacción" },
  { value: "−60%",   label: "tiempo de respuesta" },
  { value: "4,9★",   label: "valoración media" },
];

// ─── Hero component ───────────────────────────────────────────────────────────

export function Hero() {
  const reducedMotion = useReducedMotion();

  // Scroll parallax — glows drift away as user scrolls into content
  const { scrollY } = useScroll();
  const bgGlowY = useTransform(scrollY, [0, 600], [0, 55]);
  const bgGlowOpacity = useTransform(scrollY, [0, 500], [1, 0.3]);

  return (
    <section className="landing-dark relative min-h-[100dvh] flex flex-col items-center justify-start overflow-hidden pt-16">

      {/* ── Background system ── */}
      <HeroBackground bgGlowY={bgGlowY} bgGlowOpacity={bgGlowOpacity} />

      {/* ── Content column ── */}
      <div className="relative z-10 mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8 pt-20 pb-0 flex flex-col items-center text-center">

        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: heroDelay.badge, ease: [0.4, 0, 0.2, 1] }}
          className="mb-7"
        >
          <HeroBadge />
        </motion.div>

        {/* Headline — 3 lines with clip-path reveal */}
        <div className="mb-5 space-y-1">
          <HeadlineLines reducedMotion={!!reducedMotion} />
        </div>

        {/* Subheadline */}
        <motion.p
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          transition={{ delay: heroDelay.subheadline }}
          className="max-w-[560px] text-[17px] sm:text-[18px] leading-[1.65] text-zinc-500 mb-9"
        >
          Bandeja unificada con IA para{" "}
          <span className="text-emerald-400 font-medium">WhatsApp</span>,{" "}
          <span className="text-pink-400 font-medium">Instagram</span>,{" "}
          <span className="text-blue-400 font-medium">Messenger</span>{" "}
          y{" "}
          <span className="text-zinc-300 font-medium">TikTok</span>.{" "}
          Un solo lugar para todo tu equipo.
        </motion.p>

        {/* CTAs */}
        <motion.div
          variants={fadeUpSm}
          initial="hidden"
          animate="visible"
          transition={{ delay: heroDelay.ctas }}
          className="flex flex-col sm:flex-row items-center gap-3 mb-12"
        >
          <PrimaryCTA />
          <SecondaryCTA />
        </motion.div>

        {/* Trust stats */}
        <motion.div
          variants={staggerSlow}
          initial="hidden"
          animate="visible"
          className="flex flex-wrap items-center justify-center gap-8 sm:gap-12 mb-16"
        >
          {trustStats.map((stat) => (
            <motion.div
              key={stat.label}
              variants={fadeUpSm}
              transition={{ delay: heroDelay.trustStats }}
              className="flex flex-col items-center gap-0.5"
            >
              <span className="text-2xl font-bold bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent tabular-nums">
                {stat.value}
              </span>
              <span className="text-[11px] text-zinc-600 tracking-wide">{stat.label}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Channel orbs row — mobile only (desktop: lateral to mockup) */}
        <motion.div
          variants={staggerFast}
          initial="hidden"
          animate="visible"
          className="flex lg:hidden items-center justify-center gap-3 mb-10"
        >
          {channels.map((ch) => (
            <motion.div key={ch.id} variants={scaleIn}>
              <ChannelOrb channel={ch} size="sm" />
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* ── Mockup area — full width, breaks grid intentionally ── */}
      <div className="relative z-10 w-full max-w-[1280px] px-4 sm:px-6 lg:px-8">
        <MockupArea channels={channels} />
      </div>

      {/* ── Bottom fade — pulls eye into next section ── */}
      <div
        className="absolute bottom-0 inset-x-0 h-32 pointer-events-none z-20"
        style={{ background: "linear-gradient(to top, #07070a, transparent)" }}
      />
    </section>
  );
}

// ─── Background system ────────────────────────────────────────────────────────

function HeroBackground({
  bgGlowY,
  bgGlowOpacity,
}: {
  bgGlowY: MotionValue<number>;
  bgGlowOpacity: MotionValue<number>;
}) {
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      {/* Void base */}
      <div className="absolute inset-0 bg-[#07070a]" />

      {/* LIGHT 1 — Brand Zenith: drifts on scroll to create parallax depth */}
      <motion.div
        className="absolute inset-x-0 top-0 h-[700px]"
        style={{
          y: bgGlowY,
          opacity: bgGlowOpacity,
          background:
            "radial-gradient(ellipse 75% 55% at 50% -5%, rgba(16,185,129,0.11) 0%, transparent 70%)",
        }}
      />

      {/* LIGHT 2 — Cyan Depth (bottom left) */}
      <motion.div
        className="absolute bottom-0 left-0 w-[60%] h-[45%]"
        style={{
          y: bgGlowY,
          opacity: bgGlowOpacity,
          background:
            "radial-gradient(ellipse 70% 60% at 10% 100%, rgba(6,182,212,0.07) 0%, transparent 70%)",
        }}
      />

      {/* LIGHT 3 — Purple Horizon (bottom right, very subtle) */}
      <motion.div
        className="absolute bottom-0 right-0 w-[50%] h-[40%]"
        style={{
          y: bgGlowY,
          opacity: bgGlowOpacity,
          background:
            "radial-gradient(ellipse 60% 50% at 95% 100%, rgba(139,92,246,0.05) 0%, transparent 70%)",
        }}
      />

      {/* Subtle grid — static, no parallax */}
      <div
        className="absolute inset-0 opacity-[0.022]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />

      {/* Noise grain */}
      <div
        className="absolute inset-0 opacity-[0.016]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function HeroBadge() {
  return (
    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400 text-xs font-medium tracking-wide">
      {/* Pulsing dot */}
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
      </span>
      AI Omnicanal · WhatsApp · Instagram · Messenger · TikTok
    </div>
  );
}

// ─── Headline lines ───────────────────────────────────────────────────────────

interface HeadlineLine {
  text: string;
  delay: number;
  weight: string;
  color: string;
  size: string;
  preset: typeof lineReveal | typeof lineRevealSlow;
  isGradient: boolean;
}

function HeadlineLines({ reducedMotion }: { reducedMotion: boolean }) {
  const lines: HeadlineLine[] = [
    {
      text: "La plataforma de IA",
      delay: heroDelay.headline1,
      weight: "font-light",
      color: "text-zinc-300",
      size: "text-[52px] sm:text-[64px] lg:text-[72px]",
      preset: lineReveal,
      isGradient: false,
    },
    {
      text: "que unifica todas tus",
      delay: heroDelay.headline2,
      weight: "font-light",
      color: "text-zinc-300",
      size: "text-[52px] sm:text-[64px] lg:text-[72px]",
      preset: lineReveal,
      isGradient: false,
    },
    {
      text: "conversaciones.",
      delay: heroDelay.headline3,
      weight: "font-extrabold",
      color: "text-transparent",
      size: "text-[56px] sm:text-[68px] lg:text-[80px]",
      preset: lineRevealSlow,
      isGradient: true,
    },
  ];

  if (reducedMotion) {
    return (
      <>
        {lines.map((line) => (
          <div key={line.text} className={`overflow-hidden leading-[1.05] tracking-[-0.03em]`}>
            <div className={`${line.size} ${line.weight}`}>
              {line.isGradient ? (
                <span
                  className="bg-gradient-to-r from-emerald-400 via-emerald-300 to-cyan-400 bg-clip-text text-transparent"
                  style={{ backgroundSize: "200% auto" }}
                >
                  {line.text}
                </span>
              ) : (
                <span className={line.color}>{line.text}</span>
              )}
            </div>
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      {lines.map((line) => (
        <div key={line.text} className="overflow-hidden leading-[1.05] tracking-[-0.03em]">
          <motion.div
            className={`${line.size} ${line.weight}`}
            variants={line.preset}
            initial="hidden"
            animate="visible"
            transition={{ delay: line.delay }}
          >
            {line.isGradient ? (
              <motion.span
                className="bg-gradient-to-r from-emerald-400 via-emerald-300 to-cyan-400 bg-clip-text text-transparent"
                style={{ backgroundSize: "200% auto" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.8, delay: heroDelay.headline3 + 0.2 }}
              >
                {line.text}
              </motion.span>
            ) : (
              <span className={line.color}>{line.text}</span>
            )}
          </motion.div>
        </div>
      ))}
    </>
  );
}

// ─── Primary CTA ──────────────────────────────────────────────────────────────

function PrimaryCTA() {
  return (
    <Link
      href="/signup"
      className="group relative inline-flex items-center gap-2 h-12 px-7 rounded-xl font-semibold text-[15px] text-[#030712] transition-all duration-200
        bg-emerald-500
        border border-emerald-400/40
        shadow-[0_0_0_0_rgba(16,185,129,0)]
        hover:bg-emerald-400
        hover:border-emerald-300/60
        hover:shadow-[0_0_36px_-6px_rgba(16,185,129,0.50)]
        hover:scale-[1.025]
        active:scale-[0.975] active:bg-emerald-600 active:shadow-none"
    >
      Empieza gratis — sin tarjeta
      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}

// ─── Secondary CTA ───────────────────────────────────────────────────────────

function SecondaryCTA() {
  return (
    <button
      className="inline-flex items-center gap-2.5 h-12 px-6 rounded-xl font-medium text-[15px] text-zinc-300 transition-all duration-200
        border border-white/10 bg-transparent
        hover:border-white/20 hover:bg-white/[0.04] hover:text-white"
    >
      <span className="flex items-center justify-center h-6 w-6 rounded-full border border-white/15 bg-white/[0.05]">
        <Play className="h-2.5 w-2.5 text-zinc-400 fill-zinc-400 ml-0.5" />
      </span>
      Ver demo en vivo
    </button>
  );
}

// ─── Channel orb ─────────────────────────────────────────────────────────────

type ChannelData = typeof channels[number];

function ChannelOrb({
  channel,
  size = "md",
}: {
  channel: ChannelData;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-9 w-9" : "h-10 w-10";

  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center border transition-all duration-200
        hover:scale-110 cursor-default`}
      style={{
        backgroundColor: `${channel.color}10`,
        borderColor: `${channel.color}28`,
        boxShadow: `0 0 16px -4px ${channel.color}22`,
        color: channel.color,
        animationName: "ld-float",
        animationDuration: channel.floatDuration,
        animationDelay: channel.floatDelay,
        animationTimingFunction: "ease-in-out",
        animationIterationCount: "infinite",
      }}
      title={channel.label}
    >
      {channel.icon}
    </div>
  );
}

// ─── Mockup area ─────────────────────────────────────────────────────────────

const SPRING_CFG = { stiffness: 180, damping: 28 };

function MockupArea({ channels }: { channels: ChannelConfig[] }) {
  // Interactive 3D tilt — tracks mouse within the mockup element
  const rawX = useMotionValue(0); // normalised -1 → 1
  const rawY = useMotionValue(0);
  const rotateY = useSpring(useTransform(rawX, [-1, 1], [-4,  1  ]), SPRING_CFG);
  const rotateX = useSpring(useTransform(rawY, [-1, 1], [ 6,  2  ]), SPRING_CFG);

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    rawX.set((e.clientX - r.left - r.width  / 2) / (r.width  / 2));
    rawY.set((e.clientY - r.top  - r.height / 2) / (r.height / 2));
  }
  function onMouseLeave() { rawX.set(0); rawY.set(0); }

  return (
    <div className="relative flex items-start justify-center mt-0">

      {/* Channel orbs — lateral (desktop only) */}
      <div className="hidden lg:flex flex-col gap-4 pt-16 pr-4 items-end shrink-0">
        {channels.slice(0, 3).map((ch, i) => (
          <motion.div
            key={ch.id}
            variants={scaleIn}
            initial="hidden"
            animate="visible"
            transition={{ delay: heroDelay.channelOrbs + i * 0.1 }}
          >
            <ChannelOrb channel={ch} />
          </motion.div>
        ))}
      </div>

      {/* Dashboard frame — entrance + interactive 3D tilt */}
      <motion.div
        variants={mockupEntrance}
        initial="hidden"
        animate="visible"
        transition={{ delay: heroDelay.mockup }}
        className="flex-1 max-w-[920px]"
        style={{ perspective: "1200px", perspectiveOrigin: "50% 40%" }}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        <motion.div
          style={{
            rotateX,
            rotateY,
            transformStyle: "preserve-3d",
            willChange: "transform",
          }}
        >
          <HeroDashboardMockup />
        </motion.div>
      </motion.div>

      {/* Channel orbs — right side (desktop, 4th orb) */}
      <div className="hidden lg:flex flex-col gap-4 pt-28 pl-4 items-start shrink-0">
        {channels.slice(3).map((ch) => (
          <motion.div
            key={ch.id}
            variants={scaleIn}
            initial="hidden"
            animate="visible"
            transition={{ delay: heroDelay.channelOrbs + 0.3 }}
          >
            <ChannelOrb channel={ch} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
