"use client";

import React from "react";
import { motion } from "framer-motion";
import { FadeUp, StaggerGrid, StaggerItem } from "./motion-section";
import { fadeUpSm, staggerMed } from "@/lib/motion/presets";

// ─── Channel definitions ──────────────────────────────────────────────────

interface ChannelMsg { text: string; out: boolean }

interface ChannelDef {
  id:          string;
  name:        string;
  color:       string;
  glowRgb:     string;   // "r,g,b" for rgba()
  borderAlpha: string;   // e.g. "0.16"
  stat:        string;
  statLabel:   string;
  floatDelay:  string;
  floatDur:    string;
  msgs:        ChannelMsg[];
  icon:        React.ReactNode;
}

const channels: ChannelDef[] = [
  {
    id:          "wa",
    name:        "WhatsApp",
    color:       "#10b981",
    glowRgb:     "16,185,129",
    borderAlpha: "0.16",
    stat:        "2.4K",
    statLabel:   "mensajes hoy",
    floatDelay:  "0s",
    floatDur:    "5.2s",
    msgs: [
      { text: "¿Cuándo puedo ver una demo?", out: false },
      { text: "¡Claro! Hoy a las 16h. ¿Te viene bien?", out: true },
    ],
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.124.558 4.118 1.528 5.845L.057 23.5l5.82-1.527A11.952 11.952 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.645-.518-5.148-1.418l-.368-.217-3.457.906.924-3.368-.24-.389A9.953 9.953 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
      </svg>
    ),
  },
  {
    id:          "ig",
    name:        "Instagram",
    color:       "#ec4899",
    glowRgb:     "236,72,153",
    borderAlpha: "0.14",
    stat:        "847",
    statLabel:   "DMs activos",
    floatDelay:  "1.3s",
    floatDur:    "6.0s",
    msgs: [
      { text: "Vi su perfil y me interesó mucho 👀", out: false },
      { text: "¡Gracias! Te cuento todo sobre el plan Pro.", out: true },
    ],
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="6" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id:          "fb",
    name:        "Messenger",
    color:       "#3b82f6",
    glowRgb:     "59,130,246",
    borderAlpha: "0.14",
    stat:        "312",
    statLabel:   "chats abiertos",
    floatDelay:  "2.4s",
    floatDur:    "4.8s",
    msgs: [
      { text: "¿Hacen integración con Shopify?", out: false },
      { text: "Sí, integración nativa. ¿Te mando la guía?", out: true },
    ],
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.31.27.51l.05 1.6c.04.51.57.82 1.04.6l1.79-.78c.15-.07.32-.08.48-.03.79.22 1.63.33 2.5.33 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm5.98 7.28l-2.93 4.65c-.47.73-1.47.92-2.17.4l-2.33-1.75c-.21-.16-.51-.16-.72 0l-3.14 2.38c-.42.32-.96-.17-.68-.62l2.93-4.65c.47-.73 1.47-.92 2.17-.4l2.33 1.75c.21.16.51.16.72 0l3.14-2.38c.42-.32.96.17.68.62z" />
      </svg>
    ),
  },
  {
    id:          "tt",
    name:        "TikTok",
    color:       "#e4e4e7",
    glowRgb:     "228,228,231",
    borderAlpha: "0.10",
    stat:        "126",
    statLabel:   "comentarios / DMs",
    floatDelay:  "0.8s",
    floatDur:    "5.6s",
    msgs: [
      { text: "Vi el vídeo y quiero más info 🔥", out: false },
      { text: "¡Genial! Te cuento cómo empezar gratis.", out: true },
    ],
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.34 6.34 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V9.05a8.18 8.18 0 0 0 4.78 1.52V7.12a4.85 4.85 0 0 1-1.01-.43z" />
      </svg>
    ),
  },
];

// ─── Unified feed data ────────────────────────────────────────────────────

const feedItems = [
  { ch: "wa",  name: "Carlos M.",  text: "¿Cuándo es la demo?",         time: "2m"  },
  { ch: "ig",  name: "Ana G.",     text: "Vi vuestro perfil ✨",          time: "4m"  },
  { ch: "fb",  name: "Luis P.",    text: "¿Tienen API?",                  time: "7m"  },
  { ch: "tt",  name: "María T.",   text: "🔥 Vi el vídeo, quiero info",   time: "11m" },
  { ch: "wa",  name: "Jorge S.",   text: "Nos interesa el plan Pro",      time: "15m" },
  { ch: "ig",  name: "Sofía R.",   text: "¿Funciona para e-commerce?",    time: "18m" },
] as const;

const chColor: Record<string, string> = {
  wa: "#10b981", ig: "#ec4899", fb: "#3b82f6", tt: "#e4e4e7",
};
const chLabel: Record<string, string> = {
  wa: "WA", ig: "IG", fb: "FB", tt: "TT",
};

// ─── Section ──────────────────────────────────────────────────────────────

export function ChannelsSection() {
  return (
    <section className="landing-dark relative py-28 overflow-hidden bg-[#07070a]">
      {/* Separator top */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />

      {/* Section ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 55% 40% at 50% 50%, rgba(16,185,129,0.04) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* ── Header ── */}
        <FadeUp className="text-center mb-16">
          <p className="text-[12px] font-semibold text-emerald-400 uppercase tracking-[0.14em] mb-4">
            Omnicanal
          </p>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white mb-5 leading-[1.08]">
            Todos los canales.
            <br />
            <span className="bg-gradient-to-r from-emerald-400 via-emerald-300 to-cyan-400 bg-clip-text text-transparent">
              Un solo sistema de IA.
            </span>
          </h2>
          <p className="max-w-lg mx-auto text-zinc-400 text-lg leading-relaxed">
            WhatsApp, Instagram, Messenger y TikTok convergen en una bandeja unificada,
            orquestada por IA en tiempo real.
          </p>
        </FadeUp>

        {/* ── Channel cards 2x2 ── */}
        <StaggerGrid
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12"
          staggerDelay={0.08}
        >
          {channels.map((ch) => (
            <StaggerItem key={ch.id}>
              <ChannelCard channel={ch} />
            </StaggerItem>
          ))}
        </StaggerGrid>

        {/* ── Unified feed strip ── */}
        <FadeUp delay={0.2}>
          <UnifiedFeed />
        </FadeUp>
      </div>
    </section>
  );
}

// ─── Channel card ─────────────────────────────────────────────────────────

function ChannelCard({ channel: ch }: { channel: ChannelDef }) {
  return (
    <motion.div
      className="relative flex flex-col rounded-2xl overflow-hidden h-full"
      style={{
        background: `linear-gradient(145deg, rgba(${ch.glowRgb},0.06) 0%, transparent 55%), #0f0f14`,
        border: `1px solid rgba(${ch.glowRgb},${ch.borderAlpha})`,
        animationName:           "ld-float",
        animationDuration:       ch.floatDur,
        animationDelay:          ch.floatDelay,
        animationTimingFunction: "ease-in-out",
        animationIterationCount: "infinite",
      }}
      whileHover={{
        scale: 1.025,
        boxShadow: `0 0 32px -4px rgba(${ch.glowRgb},0.20), 0 12px 40px rgba(0,0,0,0.5)`,
        transition: { duration: 0.2 },
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 p-4 pb-3">
        <div style={{ color: ch.color }}>{ch.icon}</div>
        <span className="text-[13px] font-semibold text-zinc-200">{ch.name}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: ch.color,
              animation: "ld-pulse-glow 1.8s ease-in-out infinite",
            }}
          />
          <span className="text-[9px] text-zinc-500">En vivo</span>
        </div>
      </div>

      {/* Stat */}
      <div className="px-4 pb-3">
        <p className="text-[22px] font-bold tabular-nums leading-none" style={{ color: ch.color }}>
          {ch.stat}
        </p>
        <p className="text-[10px] text-zinc-600 mt-0.5">{ch.statLabel}</p>
      </div>

      {/* Divider */}
      <div
        className="mx-4 h-px mb-3"
        style={{ background: `rgba(${ch.glowRgb},0.10)` }}
      />

      {/* Mini conversation */}
      <div className="flex-1 px-4 pb-4 space-y-2">
        {ch.msgs.map((msg, i) => (
          <div key={i} className={`flex ${msg.out ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] px-2.5 py-1.5 rounded-xl text-[10px] leading-snug"
              style={{
                background: msg.out
                  ? `rgba(${ch.glowRgb},0.10)`
                  : "rgba(255,255,255,0.05)",
                color: msg.out ? ch.color : "#a1a1aa",
                border: `1px solid ${msg.out ? `rgba(${ch.glowRgb},0.18)` : "rgba(255,255,255,0.07)"}`,
                borderTopRightRadius: msg.out ? "4px" : "12px",
                borderTopLeftRadius: msg.out ? "12px" : "4px",
              }}
            >
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom fade */}
      <div
        className="absolute bottom-0 inset-x-0 h-10 pointer-events-none"
        style={{
          background: `linear-gradient(to top, rgba(${ch.glowRgb},0.05), transparent)`,
        }}
      />
    </motion.div>
  );
}

// ─── Unified feed strip ───────────────────────────────────────────────────

function UnifiedFeed() {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "#0a0a0f",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Feed header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="h-5 w-5 rounded-md flex items-center justify-center"
            style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.20)" }}
          >
            <svg className="h-3 w-3 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <span className="text-[12px] font-semibold text-zinc-200">Bandeja unificada</span>
          <span
            className="px-1.5 py-0.5 rounded-full text-[9px] font-bold"
            style={{ background: "rgba(16,185,129,0.12)", color: "#10b981", border: "1px solid rgba(16,185,129,0.20)" }}
          >
            EN VIVO
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {Object.entries(chColor).map(([id, color]) => (
            <span
              key={id}
              className="px-1.5 py-0.5 rounded text-[8px] font-bold"
              style={{ background: `${color}14`, color, border: `1px solid ${color}25` }}
            >
              {chLabel[id]}
            </span>
          ))}
        </div>
      </div>

      {/* Feed items */}
      <motion.div
        variants={staggerMed}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-40px" }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      >
        {feedItems.map((item, i) => {
          const color = chColor[item.ch];
          return (
            <motion.div
              key={i}
              variants={fadeUpSm}
              className="flex items-center gap-3 px-4 py-3"
              style={{
                borderBottom: i < feedItems.length - (feedItems.length % 3 || 3)
                  ? "1px solid rgba(255,255,255,0.04)"
                  : "none",
                borderRight: (i + 1) % 3 !== 0 ? "1px solid rgba(255,255,255,0.04)" : "none",
              }}
            >
              {/* Channel color indicator */}
              <div
                className="h-full w-[2px] rounded-full shrink-0 self-stretch"
                style={{ background: color, minHeight: "32px" }}
              />
              <div
                className="h-7 w-7 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                style={{ background: `${color}14`, color }}
              >
                {item.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className="text-[10px] font-semibold text-zinc-300 truncate">{item.name}</span>
                  <span className="text-[8px] text-zinc-600 shrink-0">{item.time}</span>
                </div>
                <p className="text-[10px] text-zinc-500 truncate">{item.text}</p>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
