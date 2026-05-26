"use client";

import React from "react";
import { motion } from "framer-motion";
import { FadeUp } from "./motion-section";
import { fadeUpSm, staggerMed } from "@/lib/motion/presets";

// ── Feature definitions ────────────────────────────────────────────────────

interface FeaturePoint {
  label: string;
  desc:  string;
  icon:  React.ReactNode;
}

interface FeatureDef {
  id:          string;
  badge:       string;
  badgeColor:  string;
  rgb:         string;
  headLine1:   string;
  headLine2:   string;
  gradient:    string;
  description: string;
  points:      FeaturePoint[];
  flip:        boolean;
}

const FEATURES: FeatureDef[] = [
  {
    id:         "inbox",
    badge:      "Bandeja Unificada",
    badgeColor: "#10b981",
    rgb:        "16,185,129",
    headLine1:  "Todos tus canales,",
    headLine2:  "una sola bandeja.",
    gradient:   "from-emerald-400 to-cyan-400",
    description:
      "Gestiona WhatsApp, Instagram, Messenger y TikTok desde un único panel inteligente. Sin pestañas, sin contexto perdido, sin caos.",
    points: [
      {
        label: "Vista unificada",
        desc:  "Todos los canales en una sola interfaz en tiempo real",
        icon: (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        ),
      },
      {
        label: "Etiquetado IA",
        desc:  "Clasificación automática por intención y urgencia",
        icon: (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
            <line x1="7" y1="7" x2="7.01" y2="7" />
          </svg>
        ),
      },
      {
        label: "Asignación smart",
        desc:  "El agente más adecuado recibe el chat automáticamente",
        icon: (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        ),
      },
    ],
    flip: false,
  },
  {
    id:         "ai-conv",
    badge:      "IA Conversacional",
    badgeColor: "#8b5cf6",
    rgb:        "139,92,246",
    headLine1:  "Respuestas en segundos.",
    headLine2:  "Ventas que no esperan.",
    gradient:   "from-violet-400 to-pink-400",
    description:
      "La IA aprende tu tono, tu catálogo y tus objeciones. Responde 24/7 como si fuera tu mejor representante de ventas.",
    points: [
      {
        label: "Responde en < 3s",
        desc:  "IA entrenada con tu base de conocimiento y productos",
        icon: (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
        ),
      },
      {
        label: "Aprende y mejora",
        desc:  "Los modelos se afinan con cada interacción y feedback",
        icon: (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3" />
          </svg>
        ),
      },
      {
        label: "Handoff sin corte",
        desc:  "Contexto completo transferido al agente humano",
        icon: (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3" />
          </svg>
        ),
      },
    ],
    flip: true,
  },
  {
    id:         "analytics",
    badge:      "Analítica en Tiempo Real",
    badgeColor: "#f59e0b",
    rgb:        "245,158,11",
    headLine1:  "Métricas que mueven",
    headLine2:  "el negocio.",
    gradient:   "from-amber-400 to-orange-400",
    description:
      "Ve en tiempo real cuántos leads entran, cuántos convierten, qué mensajes funcionan y dónde cae el funnel. Decisiones basadas en datos, no intuición.",
    points: [
      {
        label: "Funnel completo",
        desc:  "De primer mensaje a cierre de venta, todo trazado",
        icon: (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        ),
      },
      {
        label: "KPIs de equipo",
        desc:  "Rendimiento individual y grupal en un vistazo",
        icon: (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        ),
      },
      {
        label: "Exporta y conecta",
        desc:  "Integra con tu CRM, Google Sheets o HubSpot",
        icon: (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="8 17 12 21 16 17" />
            <line x1="12" y1="12" x2="12" y2="21" />
            <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" />
          </svg>
        ),
      },
    ],
    flip: false,
  },
];

// ── Section export ─────────────────────────────────────────────────────────

export function FeaturesV2() {
  return (
    <section id="features" className="landing-dark relative bg-[#07070a]">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />

      {FEATURES.map((feat, i) => (
        <FeatureRow key={feat.id} feat={feat} index={i} />
      ))}
    </section>
  );
}

// ── Feature row ────────────────────────────────────────────────────────────

function FeatureRow({ feat, index }: { feat: FeatureDef; index: number }) {
  const glowX = feat.flip ? "30%" : "70%";

  return (
    <div className="relative py-24 overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 40% 60% at ${glowX} 50%, rgba(${feat.rgb},0.03) 0%, transparent 70%)`,
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className={`flex flex-col ${
            feat.flip ? "lg:flex-row-reverse" : "lg:flex-row"
          } items-center gap-12 lg:gap-20`}
        >
          {/* ── Text side ── */}
          <div className="flex-1 max-w-xl">
            <FadeUp>
              <p
                className="text-[12px] font-semibold uppercase tracking-[0.14em] mb-4"
                style={{ color: feat.badgeColor }}
              >
                {feat.badge}
              </p>
            </FadeUp>

            <FadeUp delay={0.05}>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-5 leading-[1.1]">
                {feat.headLine1}
                <br />
                <span
                  className={`bg-gradient-to-r ${feat.gradient} bg-clip-text text-transparent`}
                >
                  {feat.headLine2}
                </span>
              </h2>
            </FadeUp>

            <FadeUp delay={0.1}>
              <p className="text-zinc-400 text-base sm:text-lg leading-relaxed mb-8">
                {feat.description}
              </p>
            </FadeUp>

            <motion.div
              variants={staggerMed}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              className="space-y-4"
            >
              {feat.points.map((pt) => (
                <motion.div
                  key={pt.label}
                  variants={fadeUpSm}
                  className="flex items-start gap-3"
                >
                  <div
                    className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                    style={{
                      background: `rgba(${feat.rgb},0.08)`,
                      border:     `1px solid rgba(${feat.rgb},0.18)`,
                      color:      feat.badgeColor,
                    }}
                  >
                    {pt.icon}
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-zinc-200">{pt.label}</p>
                    <p className="text-[12px] text-zinc-500 leading-snug">{pt.desc}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* ── Visual side ── */}
          <motion.div
            className="flex-1 w-full max-w-lg"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: index * 0 }}
          >
            {feat.id === "inbox"     && <InboxMockup     rgb={feat.rgb} color={feat.badgeColor} />}
            {feat.id === "ai-conv"   && <AIChatMockup    rgb={feat.rgb} color={feat.badgeColor} />}
            {feat.id === "analytics" && <AnalyticsMockup rgb={feat.rgb} color={feat.badgeColor} />}
          </motion.div>
        </div>
      </div>

      {index < FEATURES.length - 1 && (
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
      )}
    </div>
  );
}

// ── Visual: Inbox mockup ───────────────────────────────────────────────────

const inboxRows = [
  { ch: "wa", color: "#10b981", name: "Carlos M.",  preview: "¿Precio del plan Pro?",       time: "2m",  unread: 2 },
  { ch: "ig", color: "#ec4899", name: "Ana García", preview: "Vi vuestro perfil ✨",          time: "5m",  unread: 1 },
  { ch: "fb", color: "#3b82f6", name: "Luis Pérez", preview: "¿Tienen integración Shopify?", time: "9m",  unread: 0 },
  { ch: "tt", color: "#e4e4e7", name: "María T.",   preview: "Vi el vídeo 🔥 quiero info",   time: "12m", unread: 3 },
  { ch: "wa", color: "#10b981", name: "Jorge S.",   preview: "Quiero hablar con alguien",    time: "18m", unread: 0 },
];

const chSigil: Record<string, string> = { wa: "WA", ig: "IG", fb: "FB", tt: "TT" };

function InboxMockup({ rgb, color }: { rgb: string; color: string }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "#0a0a10",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: `0 32px 64px rgba(0,0,0,0.5), 0 0 40px rgba(${rgb},0.06)`,
      }}
    >
      {/* Chrome */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        </div>
        <div
          className="flex-1 h-5 rounded-md ml-2"
          style={{ background: "rgba(255,255,255,0.04)" }}
        />
        <span
          className="px-2 py-0.5 rounded-full text-[9px] font-bold"
          style={{ background: `rgba(${rgb},0.12)`, color, border: `1px solid rgba(${rgb},0.20)` }}
        >
          BANDEJA
        </span>
      </div>

      {/* Search + filter bar */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
      >
        <div
          className="flex-1 h-6 rounded-lg flex items-center gap-2 px-2"
          style={{ background: "rgba(255,255,255,0.04)" }}
        >
          <svg className="h-3 w-3 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="text-[10px] text-zinc-600">Buscar mensajes…</span>
        </div>
        {["WA", "IG", "FB"].map((ch) => (
          <span
            key={ch}
            className="px-1.5 py-0.5 rounded text-[8px] font-bold"
            style={{ background: "rgba(255,255,255,0.05)", color: "#71717a" }}
          >
            {ch}
          </span>
        ))}
      </div>

      {/* Rows */}
      {inboxRows.map((row, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-3"
          style={{
            borderBottom: i < inboxRows.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
            background: i === 0 ? `rgba(${rgb},0.04)` : "transparent",
          }}
        >
          {/* Channel dot + avatar */}
          <div className="relative shrink-0">
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-[9px] font-bold"
              style={{ background: `${row.color}14`, color: row.color }}
            >
              {row.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </div>
            <span
              className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full text-[5px] font-bold flex items-center justify-center"
              style={{ background: row.color, color: "#000" }}
            >
              {chSigil[row.ch]?.[0]}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[11px] font-semibold text-zinc-200">{row.name}</span>
              <span className="text-[9px] text-zinc-600">{row.time}</span>
            </div>
            <p className="text-[10px] text-zinc-500 truncate">{row.preview}</p>
          </div>

          {row.unread > 0 && (
            <span
              className="h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0"
              style={{ background: color, color: "#000" }}
            >
              {row.unread}
            </span>
          )}
        </div>
      ))}

      {/* Footer */}
      <div
        className="px-4 py-2.5 flex items-center justify-between"
        style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
      >
        <span className="text-[9px] text-zinc-600">5 conversaciones activas</span>
        <span
          className="text-[9px] font-medium"
          style={{ color }}
        >
          Ver todas →
        </span>
      </div>
    </div>
  );
}

// ── Visual: AI Chat mockup ─────────────────────────────────────────────────

const aiMessages = [
  { out: false, text: "Hola, vi sus anuncios. ¿Cuánto cuesta el plan Pro?" },
  { out: true,  text: "¡Hola! El plan Pro tiene un precio de $79/mes e incluye hasta 5 agentes, IA ilimitada y todos los canales. ¿Te gustaría ver una demo en vivo?" },
];

function AIChatMockup({ rgb, color }: { rgb: string; color: string }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "#0a0a10",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: `0 32px 64px rgba(0,0,0,0.5), 0 0 40px rgba(${rgb},0.06)`,
      }}
    >
      {/* Chrome */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        </div>
        <div
          className="h-7 w-7 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <span className="text-[9px] font-bold text-zinc-300">CG</span>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-zinc-200 leading-none">Carlos García</p>
          <p className="text-[9px] text-zinc-600 mt-0.5 flex items-center gap-1">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "#10b981", display: "inline-block", animation: "ld-pulse-glow 1.8s ease-in-out infinite" }}
            />
            WhatsApp · En línea
          </p>
        </div>
        <div className="ml-auto">
          <span
            className="px-2 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-1"
            style={{ background: `rgba(${rgb},0.12)`, color, border: `1px solid rgba(${rgb},0.20)` }}
          >
            <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            IA activa
          </span>
        </div>
      </div>

      {/* Chat */}
      <div className="p-4 space-y-3 min-h-[180px]">
        {aiMessages.map((msg, i) => (
          <div key={i} className={`flex ${msg.out ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[80%] px-3 py-2 rounded-2xl text-[11px] leading-relaxed"
              style={{
                background: msg.out
                  ? `rgba(${rgb},0.12)`
                  : "rgba(255,255,255,0.05)",
                color: msg.out ? color : "#a1a1aa",
                border: `1px solid ${msg.out ? `rgba(${rgb},0.20)` : "rgba(255,255,255,0.07)"}`,
                borderTopRightRadius: msg.out ? "4px" : "16px",
                borderTopLeftRadius:  msg.out ? "16px" : "4px",
              }}
            >
              {msg.text}
              {msg.out && (
                <div className="flex items-center gap-1 mt-1 justify-end">
                  <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <svg className="h-2.5 w-2.5 -ml-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="text-[8px] opacity-60">IA</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* AI thinking + typing */}
        <div className="flex justify-end">
          <div
            className="px-3 py-2 rounded-2xl rounded-tr-[4px] text-[9px] flex items-center gap-1.5"
            style={{
              background: `rgba(${rgb},0.06)`,
              border: `1px solid rgba(${rgb},0.12)`,
              color,
            }}
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            IA redactando…
            <span className="flex gap-0.5 ml-0.5">
              {[0, 80, 160].map((d) => (
                <span
                  key={d}
                  className="h-1 w-1 rounded-full"
                  style={{
                    background: color,
                    animation: `ld-dot-wave 1s ease-in-out infinite`,
                    animationDelay: `${d}ms`,
                  }}
                />
              ))}
            </span>
          </div>
        </div>
      </div>

      {/* Input bar */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div
          className="flex-1 h-7 rounded-xl flex items-center px-3"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <span className="text-[10px] text-zinc-600">Respuesta sugerida por IA…</span>
        </div>
        <button
          className="h-7 w-7 rounded-xl flex items-center justify-center"
          style={{ background: `rgba(${rgb},0.15)`, color }}
          type="button"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Visual: Analytics mockup ───────────────────────────────────────────────

const kpis = [
  { label: "Conversión",    value: "34.8%", delta: "+12%", positive: true  },
  { label: "Resp. promedio", value: "2.4s",  delta: "-67%", positive: true  },
  { label: "CSAT",          value: "4.8★",  delta: "+0.3", positive: true  },
];

const bars = [
  { label: "L",  h: 55  },
  { label: "M",  h: 72  },
  { label: "X",  h: 48  },
  { label: "J",  h: 85  },
  { label: "V",  h: 93  },
  { label: "S",  h: 60  },
  { label: "D",  h: 40  },
];

function AnalyticsMockup({ rgb, color }: { rgb: string; color: string }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "#0a0a10",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: `0 32px 64px rgba(0,0,0,0.5), 0 0 40px rgba(${rgb},0.06)`,
      }}
    >
      {/* Chrome */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        </div>
        <span className="text-[11px] font-semibold text-zinc-300 ml-2">Analítica</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[9px] text-zinc-600">Últimos 7 días</span>
          <span
            className="px-2 py-0.5 rounded-full text-[9px] font-bold"
            style={{ background: `rgba(${rgb},0.12)`, color, border: `1px solid rgba(${rgb},0.20)` }}
          >
            EN VIVO
          </span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3 p-4 pb-3">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-xl p-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
          >
            <p className="text-[9px] text-zinc-600 mb-1">{k.label}</p>
            <p className="text-[16px] font-bold text-white tabular-nums leading-none">{k.value}</p>
            <p
              className="text-[9px] font-medium mt-1"
              style={{ color: k.positive ? "#10b981" : "#ef4444" }}
            >
              {k.delta} vs mes ant.
            </p>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div className="px-4 pb-4">
        <div
          className="rounded-xl p-3"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-zinc-400 font-medium">Mensajes procesados</span>
            <span className="text-[10px] font-bold" style={{ color }}>↑ 23%</span>
          </div>

          <div className="flex items-end gap-1.5 h-16">
            {bars.map((bar, i) => (
              <div key={i} className="flex flex-col items-center gap-1 flex-1">
                <motion.div
                  className="w-full rounded-t-sm"
                  style={{ background: i === 4 ? color : `rgba(${rgb},0.25)` }}
                  initial={{ height: 0 }}
                  whileInView={{ height: `${bar.h}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                />
                <span className="text-[7px] text-zinc-600">{bar.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-full" style={{ background: color }} />
            <span className="text-[9px] text-zinc-600">Hoy (mayor)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-full" style={{ background: `rgba(${rgb},0.25)` }} />
            <span className="text-[9px] text-zinc-600">Días anteriores</span>
          </div>
        </div>
      </div>
    </div>
  );
}
