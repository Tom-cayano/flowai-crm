"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { heroDelay } from "@/lib/motion/transitions";
import { scaleIn, messageBubble } from "@/lib/motion/presets";
import { useCountUp } from "@/lib/motion/use-count-up";

// ─── KPI card data ─────────────────────────────────────────────────────────

interface KPICardDef {
  id: string;
  label: string;
  countTarget: number | null; // null = not animated (non-numeric)
  displayValue: string;       // fallback / prefix+suffix composite
  prefix: string;
  suffix: string;
  sub: string;
  color: string;
  glowColor: string;
  position: "top-right" | "bottom-left" | "top-left-far";
  floatDelay: string;
  floatDuration: string;
}

const kpiCards: KPICardDef[] = [
  {
    id: "conversions",
    label: "Conversiones",
    countTarget: 34,
    displayValue: "+34%",
    prefix: "+",
    suffix: "%",
    sub: "89 hoy",
    color: "#10b981",
    glowColor: "rgba(16,185,129,0.12)",
    position: "top-right",
    floatDelay: "0s",
    floatDuration: "6s",
  },
  {
    id: "automations",
    label: "Automatizaciones",
    countTarget: null,
    displayValue: "3 activas",
    prefix: "",
    suffix: "",
    sub: "ahora mismo",
    color: "#06b6d4",
    glowColor: "rgba(6,182,212,0.10)",
    position: "bottom-left",
    floatDelay: "2s",
    floatDuration: "5.5s",
  },
  {
    id: "messages",
    label: "Mensajes",
    countTarget: 247,
    displayValue: "247",
    prefix: "",
    suffix: "",
    sub: "últimas 24h",
    color: "#10b981",
    glowColor: "rgba(16,185,129,0.09)",
    position: "top-left-far",
    floatDelay: "3.5s",
    floatDuration: "7s",
  },
];

// ─── Static conversations (sidebar list) ──────────────────────────────────

const conversations = [
  { name: "Carlos Mendoza",  msg: "Perfecto, a las 16h 👍",   time: "2m", ch: "wa" as const, active: true,  unread: 0, init: "CM" },
  { name: "Ana García",      msg: "Recibí la propuesta",       time: "8m", ch: "ig" as const, active: false, unread: 0, init: "AG" },
  { name: "Luis Paredes",    msg: "¿Tienen integración con...?",time:"15m",ch: "fb" as const, active: false, unread: 2, init: "LP" },
  { name: "María Torres",    msg: "Confirmado para el jueves", time: "1h", ch: "wa" as const, active: false, unread: 0, init: "MT" },
  { name: "Jorge Silva",     msg: "Nos interesa el plan Pro",  time: "2h", ch: "tt" as const, active: false, unread: 0, init: "JS" },
] as const;

const channelCfg = {
  wa: { color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  ig: { color: "#ec4899", bg: "rgba(236,72,153,0.12)" },
  fb: { color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  tt: { color: "#e4e4e7", bg: "rgba(228,228,231,0.10)" },
} as const;

// ─── Chat loop phase types ─────────────────────────────────────────────────

type ChatPhase =
  | "initial"
  | "user-typing"
  | "new-message"
  | "ai-thinking"
  | "ai-response"
  | "read-receipt";

const PHASES: ChatPhase[] = [
  "initial",
  "user-typing",
  "new-message",
  "ai-thinking",
  "ai-response",
  "read-receipt",
];

// Duration each phase lasts (ms) before advancing
const DURATIONS: Record<ChatPhase, number> = {
  "initial":      2800,
  "user-typing":  1600,
  "new-message":   700,
  "ai-thinking":  1800,
  "ai-response":  2200,
  "read-receipt": 2500,
};

// ─── Main export ───────────────────────────────────────────────────────────

export function HeroDashboardMockup() {
  return (
    <div className="relative">
      {/* Ambient halo behind frame */}
      <div
        className="absolute -inset-4 rounded-3xl pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 60%, rgba(16,185,129,0.06) 0%, transparent 70%)",
          animation: "ld-pulse-glow 4s ease-in-out infinite",
        }}
      />

      {/* Browser frame */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #14141a 0%, #0e0e14 100%)",
          border: "1px solid rgba(255,255,255,0.07)",
          boxShadow:
            "0 24px 64px rgba(0,0,0,0.70)," +
            "0 8px 16px rgba(0,0,0,0.50)," +
            "inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        <BrowserChrome />

        <div className="flex h-[480px] sm:h-[520px]">
          <MockupSidebar />
          <MockupConversationList />
          <LiveChatWindow />
        </div>
      </div>

      {/* Floating KPI cards */}
      <FloatingKPICards />
    </div>
  );
}

// ─── Browser chrome ────────────────────────────────────────────────────────

function BrowserChrome() {
  return (
    <div
      className="flex items-center gap-2 px-4 py-3"
      style={{
        background: "#0a0a0f",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex gap-1.5 shrink-0">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
      </div>
      <div
        className="flex-1 mx-4 h-6 rounded-md flex items-center px-3 gap-2"
        style={{
          background: "rgba(255,255,255,0.035)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
        <span className="text-[10px] text-zinc-600 font-mono">
          app.flowai.io/conversaciones
        </span>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────

function MockupSidebar() {
  const navPaths = [
    "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
    "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2",
    "M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z",
    "M22 12h-4l-3 9L9 3l-3 9H2",
  ];
  return (
    <div
      className="w-[52px] shrink-0 flex flex-col items-center py-4 gap-3"
      style={{ background: "#09090e", borderRight: "1px solid rgba(255,255,255,0.05)" }}
    >
      <div className="h-7 w-7 flex items-center justify-center mb-1">
        <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
          <defs>
            <linearGradient id="hsg" x1="5" y1="23" x2="27" y2="4" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
          </defs>
          <circle cx="16" cy="15" r="7.5" stroke="url(#hsg)" strokeWidth="0.75" strokeOpacity="0.3" fill="none" />
          <line x1="16" y1="11" x2="16" y2="8" stroke="url(#hsg)" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="19.3" y1="17.2" x2="22.9" y2="19.6" stroke="url(#hsg)" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="12.7" y1="17.2" x2="9.1" y2="19.6" stroke="url(#hsg)" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="16" cy="5.5" r="2.5" fill="url(#hsg)" />
          <circle cx="25" cy="21.5" r="2.5" fill="#06b6d4" />
          <circle cx="7" cy="21.5" r="2.5" fill="#10b981" />
          <circle cx="16" cy="15" r="3.5" fill="url(#hsg)" />
        </svg>
      </div>
      {navPaths.map((d, i) => (
        <div
          key={i}
          className="h-8 w-8 rounded-lg flex items-center justify-center"
          style={{
            background: i === 1 ? "rgba(16,185,129,0.10)" : "transparent",
            border: i === 1 ? "1px solid rgba(16,185,129,0.15)" : "1px solid transparent",
          }}
        >
          <svg
            className="h-3.5 w-3.5"
            style={{ color: i === 1 ? "#10b981" : "#3f3f46" }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={d} />
          </svg>
        </div>
      ))}
    </div>
  );
}

// ─── Conversation list ────────────────────────────────────────────────────

function MockupConversationList() {
  return (
    <div
      className="w-[220px] shrink-0 flex flex-col"
      style={{ background: "#0f0f14", borderRight: "1px solid rgba(255,255,255,0.05)" }}
    >
      {/* Search */}
      <div className="px-3 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div
          className="h-7 rounded-lg flex items-center px-2.5 gap-1.5"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <svg className="h-3 w-3 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <span className="text-[10px] text-zinc-600">Buscar...</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-0.5 px-2 py-1.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        {["Todas", "Abiertas", "IA"].map((tab, i) => (
          <span
            key={tab}
            className="px-2 py-0.5 rounded text-[9px] font-medium"
            style={{
              background: i === 0 ? "rgba(16,185,129,0.10)" : "transparent",
              color: i === 0 ? "#10b981" : "#52525b",
              border: i === 0 ? "1px solid rgba(16,185,129,0.15)" : "1px solid transparent",
            }}
          >
            {tab}
          </span>
        ))}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-hidden py-1">
        {conversations.map((conv) => {
          const ch = channelCfg[conv.ch];
          return (
            <div
              key={conv.name}
              className="flex items-center gap-2.5 px-3 py-2"
              style={{
                background: conv.active ? "rgba(255,255,255,0.04)" : "transparent",
                borderLeft: conv.active ? `2px solid ${ch.color}` : "2px solid transparent",
              }}
            >
              <div
                className="h-7 w-7 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold"
                style={{ background: ch.bg, color: ch.color }}
              >
                {conv.init}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className="text-[10px] font-semibold text-zinc-200 truncate">{conv.name}</span>
                  <span className="text-[8px] text-zinc-600 shrink-0">{conv.time}</span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[9px] text-zinc-500 truncate">{conv.msg}</span>
                  {conv.unread > 0 && (
                    <span
                      className="h-3.5 min-w-[14px] rounded-full flex items-center justify-center text-[7px] font-bold shrink-0 px-0.5"
                      style={{ background: ch.color, color: "#030712" }}
                    >
                      {conv.unread}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Live chat window — animated message loop ─────────────────────────────

function LiveChatWindow() {
  const [phase, setPhase] = useState<ChatPhase>("initial");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let idx = 0;

    function advance() {
      idx = (idx + 1) % PHASES.length;
      const next = PHASES[idx];
      setPhase(next);
      timerRef.current = setTimeout(advance, DURATIONS[next]);
    }

    timerRef.current = setTimeout(advance, DURATIONS["initial"]);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const showUserTyping  = phase === "user-typing";
  const showNewMsg      = phase === "new-message" || phase === "ai-thinking" || phase === "ai-response" || phase === "read-receipt";
  const showAIThinking  = phase === "ai-thinking";
  const showAIResponse  = phase === "ai-response" || phase === "read-receipt";
  const readReceiptGreen= phase === "read-receipt";

  return (
    <div className="flex-1 flex flex-col min-w-0" style={{ background: "#09090b" }}>
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-4 py-2.5 shrink-0"
        style={{ background: "#0f0f14", borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div
          className="h-7 w-7 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
          style={{ background: "rgba(16,185,129,0.14)", color: "#10b981" }}
        >
          CM
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-zinc-200 leading-tight">Carlos Mendoza</p>
          <p className="text-[9px] text-zinc-600 leading-tight">En línea · WhatsApp</p>
        </div>
        <span
          className="px-2 py-0.5 rounded-full text-[8px] font-semibold shrink-0"
          style={{
            background: "rgba(16,185,129,0.10)",
            border: "1px solid rgba(16,185,129,0.20)",
            color: "#10b981",
          }}
        >
          Abierta
        </span>
      </div>

      {/* Messages area */}
      <div className="flex-1 px-4 py-4 flex flex-col gap-3 overflow-hidden">
        {/* Base messages — always visible */}
        <ChatBubble direction="in"  text="Hola, ¿cuándo puedo ver una demo?" time="10:24" />
        <ChatBubble
          direction="out"
          text="¡Hola Carlos! Puedo mostrarte hoy a las 16h. ¿Te viene bien?"
          time="10:25"
          tickColor={readReceiptGreen ? "#10b981" : "#3f3f46"}
        />
        <ChatBubble direction="in"  text="Perfecto, a las 16h 👍" time="10:27" />

        {/* Typing indicator — Carlos writing */}
        <AnimatePresence>
          {showUserTyping && (
            <motion.div
              key="user-typing"
              variants={messageBubble}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              className="flex justify-start"
            >
              <TypingDots color="#71717a" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* New message from Carlos */}
        <AnimatePresence>
          {showNewMsg && (
            <motion.div
              key="new-message"
              variants={messageBubble}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
            >
              <ChatBubble
                direction="in"
                text="¿Tienen integración con HubSpot también?"
                time="10:29"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI thinking */}
        <AnimatePresence>
          {showAIThinking && (
            <motion.div
              key="ai-thinking"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.25 } }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
            >
              <AIThinkingChip />
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI response */}
        <AnimatePresence>
          {showAIResponse && (
            <motion.div
              key="ai-response"
              variants={messageBubble}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
            >
              <ChatBubble
                direction="out"
                text="¡Sí! Integración nativa con HubSpot, Salesforce y Pipedrive. ¿Te mando la guía?"
                time="10:29"
                tickColor={readReceiptGreen ? "#10b981" : "#3f3f46"}
                isAI
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input bar */}
      <div className="px-3 pb-3 shrink-0">
        <div
          className="h-9 rounded-xl flex items-center px-3 gap-2"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <span className="text-[10px] text-zinc-600 flex-1">Escribe un mensaje...</span>
          <div className="flex items-center gap-1.5">
            {["M4 6h16M4 12h16M4 18h7", "M15.5 7.5 19 11l-7 7-4-4 7-7z"].map((d, i) => (
              <svg key={i} className="h-3.5 w-3.5 text-zinc-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                <path d={d} />
              </svg>
            ))}
            <div className="h-5 w-5 rounded-lg flex items-center justify-center ml-1" style={{ background: "#10b981" }}>
              <svg className="h-2.5 w-2.5 text-[#030712]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 2L11 13M22 2 15 22 11 13 2 9l20-7z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Chat bubble ──────────────────────────────────────────────────────────

function ChatBubble({
  direction,
  text,
  time,
  tickColor = "#3f3f46",
  isAI = false,
}: {
  direction: "in" | "out";
  text: string;
  time: string;
  tickColor?: string;
  isAI?: boolean;
}) {
  const isOut = direction === "out";
  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[70%] rounded-2xl px-3 py-2"
        style={
          isOut
            ? {
                background: "rgba(16,185,129,0.10)",
                border: "1px solid rgba(16,185,129,0.14)",
                borderTopRightRadius: "4px",
              }
            : {
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderTopLeftRadius: "4px",
              }
        }
      >
        {isAI && (
          <div className="flex items-center gap-1 mb-1">
            <span
              className="h-1 w-1 rounded-full"
              style={{ background: "#06b6d4" }}
            />
            <span className="text-[8px] font-medium" style={{ color: "#06b6d4" }}>
              FlowAI
            </span>
          </div>
        )}
        <p
          className="text-[11px] leading-snug mb-1"
          style={{ color: isOut ? "#34d399" : "#d4d4d8" }}
        >
          {text}
        </p>
        <div className={`flex items-center gap-1 ${isOut ? "justify-end" : ""}`}>
          <span
            className="text-[8px]"
            style={{ color: isOut ? "rgba(52,211,153,0.5)" : "#52525b" }}
          >
            {time}
          </span>
          {isOut && (
            <motion.span
              className="text-[8px]"
              style={{ color: tickColor }}
              animate={{ color: tickColor }}
              transition={{ duration: 0.4 }}
            >
              ✓✓
            </motion.span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Typing dots ──────────────────────────────────────────────────────────

function TypingDots({ color }: { color: string }) {
  return (
    <div
      className="inline-flex items-center gap-1 px-3 py-2 rounded-2xl"
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderTopLeftRadius: "4px",
      }}
    >
      {[0, 80, 160].map((delay, i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: color,
            animation: `ld-dot-wave 1.2s ease-in-out ${delay}ms infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ─── AI thinking chip ─────────────────────────────────────────────────────

function AIThinkingChip() {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={{
        background: "rgba(6,182,212,0.07)",
        border: "1px solid rgba(6,182,212,0.15)",
      }}
    >
      <TypingDots color="#06b6d4" />
      <span className="text-[9px] font-medium ml-0.5" style={{ color: "#06b6d4" }}>
        FlowAI respondiendo...
      </span>
    </div>
  );
}

// ─── Floating KPI cards ───────────────────────────────────────────────────

const POS_CLASSES: Record<KPICardDef["position"], string> = {
  "top-right":    "-top-6 -right-4 lg:-right-8",
  "bottom-left":  "-bottom-5 -left-4 lg:-left-8",
  "top-left-far": "top-14 -left-2 lg:-left-10",
};

function FloatingKPICards() {
  return (
    <>
      {kpiCards.map((card, i) => (
        <motion.div
          key={card.id}
          variants={scaleIn}
          initial="hidden"
          animate="visible"
          transition={{ delay: heroDelay.kpiCards + i * 0.18 }}
          className={`absolute ${POS_CLASSES[card.position]} hidden sm:block z-10`}
          style={{
            animationName: "ld-float",
            animationDuration: card.floatDuration,
            animationDelay: card.floatDelay,
            animationTimingFunction: "ease-in-out",
            animationIterationCount: "infinite",
          }}
        >
          <KPICard card={card} />
        </motion.div>
      ))}
    </>
  );
}

// ─── Single KPI card ──────────────────────────────────────────────────────

function KPICard({ card }: { card: KPICardDef }) {
  const countRef = useCountUp(
    card.countTarget ?? 0,
    { prefix: card.prefix, suffix: card.suffix, duration: 0.9 }
  );

  return (
    <motion.div
      className="rounded-xl px-3.5 py-2.5 min-w-[130px] cursor-default"
      style={{
        background: "rgba(12,12,18,0.88)",
        border: "1px solid rgba(255,255,255,0.09)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        boxShadow:
          `0 8px 32px rgba(0,0,0,0.55),` +
          `0 0 0 1px rgba(255,255,255,0.04),` +
          `0 0 24px -4px ${card.glowColor}`,
      }}
      whileHover={{
        scale: 1.04,
        boxShadow:
          `0 12px 40px rgba(0,0,0,0.65),` +
          `0 0 0 1px rgba(255,255,255,0.07),` +
          `0 0 36px -4px ${card.glowColor.replace("0.10", "0.22").replace("0.12", "0.24").replace("0.09", "0.18")}`,
        transition: { duration: 0.2 },
      }}
    >
      <p className="text-[9px] font-medium text-zinc-500 mb-0.5 uppercase tracking-wide">
        {card.label}
      </p>

      <p className="text-[18px] font-bold leading-tight tabular-nums" style={{ color: card.color }}>
        {card.countTarget !== null ? (
          <span ref={countRef}>{card.displayValue}</span>
        ) : (
          card.displayValue
        )}
      </p>

      <p className="text-[9px] text-zinc-600 mt-0.5">{card.sub}</p>
    </motion.div>
  );
}
