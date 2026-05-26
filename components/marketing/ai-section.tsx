"use client";

import React from "react";
import { motion } from "framer-motion";
import { FadeUp } from "./motion-section";
import { fadeUpSm, staggerMed, staggerFast } from "@/lib/motion/presets";

// ── Pipeline steps ─────────────────────────────────────────────────────────

interface PipelineStep {
  id:    string;
  step:  number;
  label: string;
  desc:  string;
  color: string;
  rgb:   string;
  icon:  React.ReactNode;
}

const pipelineSteps: PipelineStep[] = [
  {
    id: "ingest", step: 1,
    label: "Ingesta",
    desc: "Mensajes entrantes de 4 canales en tiempo real",
    color: "#10b981", rgb: "16,185,129",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: "classify", step: 2,
    label: "Clasificación IA",
    desc: "Intención, sentimiento y prioridad detectados",
    color: "#06b6d4", rgb: "6,182,212",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
      </svg>
    ),
  },
  {
    id: "route", step: 3,
    label: "Enrutamiento",
    desc: "Responder auto, escalar o disparar flujo",
    color: "#8b5cf6", rgb: "139,92,246",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </svg>
    ),
  },
  {
    id: "execute", step: 4,
    label: "Ejecución",
    desc: "Acción completada en menos de 3 segundos",
    color: "#f59e0b", rgb: "245,158,11",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
];

// ── Live decisions ─────────────────────────────────────────────────────────

type ActionType = "auto-reply" | "handoff" | "automation" | "queue";

interface Decision {
  ch:     string;
  name:   string;
  text:   string;
  intent: string;
  action: ActionType;
  time:   string;
}

const decisions: Decision[] = [
  { ch: "wa", name: "Carlos M.",  text: "¿Precio del plan Pro?",        intent: "Compra",   action: "auto-reply", time: "ahora" },
  { ch: "ig", name: "Ana G.",     text: "Problemas con mi cuenta",       intent: "Soporte",  action: "handoff",    time: "1m"    },
  { ch: "fb", name: "Luis P.",    text: "¿Tienen integración Shopify?",  intent: "Info",     action: "auto-reply", time: "2m"    },
  { ch: "tt", name: "María T.",   text: "Vi el vídeo, quiero más info",  intent: "Lead",     action: "automation", time: "3m"    },
  { ch: "wa", name: "Jorge S.",   text: "Quiero hablar con un humano",   intent: "Escalado", action: "handoff",    time: "5m"    },
  { ch: "ig", name: "Sofía R.",   text: "¿Descuento si pago anual?",     intent: "Compra",   action: "auto-reply", time: "7m"    },
];

const chColor: Record<string, string> = { wa: "#10b981", ig: "#ec4899", fb: "#3b82f6", tt: "#e4e4e7" };
const chLabel: Record<string, string> = { wa: "WA",      ig: "IG",      fb: "FB",      tt: "TT"      };

const intentStyle: Record<string, { bg: string; text: string }> = {
  Compra:   { bg: "rgba(16,185,129,0.10)", text: "#10b981" },
  Soporte:  { bg: "rgba(245,158,11,0.10)", text: "#f59e0b" },
  Info:     { bg: "rgba(6,182,212,0.10)",  text: "#06b6d4" },
  Lead:     { bg: "rgba(139,92,246,0.10)", text: "#8b5cf6" },
  Escalado: { bg: "rgba(239,68,68,0.10)",  text: "#ef4444" },
};

const actionMeta: Record<ActionType, { bg: string; text: string; label: string }> = {
  "auto-reply": { bg: "rgba(16,185,129,0.10)",  text: "#10b981", label: "Auto-reply"  },
  handoff:      { bg: "rgba(245,158,11,0.10)",  text: "#f59e0b", label: "Agente"      },
  automation:   { bg: "rgba(139,92,246,0.10)",  text: "#8b5cf6", label: "Automatiz."  },
  queue:        { bg: "rgba(6,182,212,0.10)",   text: "#06b6d4", label: "Cola"        },
};

// ── Stats ──────────────────────────────────────────────────────────────────

const aiStats = [
  { value: "<3s",  label: "Tiempo de respuesta promedio" },
  { value: "89%",  label: "Mensajes automatizados"       },
  { value: "4.8★", label: "Satisfacción del cliente"     },
];

// ── Step connector ─────────────────────────────────────────────────────────

function StepConnector({ color }: { color: string }) {
  return (
    <div className="hidden lg:flex items-center shrink-0 w-8 mx-0.5">
      <svg className="w-full h-3" viewBox="0 0 32 10" preserveAspectRatio="none">
        <line
          x1="0" y1="5" x2="27" y2="5"
          stroke={color}
          strokeOpacity="0.35"
          strokeWidth="1.5"
          style={{
            strokeDasharray:  "5 5",
            strokeDashoffset: "20",
            animation: "ld-dash-flow 1s linear infinite",
          }}
        />
        <path d="M25 2 L32 5 L25 8" fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="1.2" />
      </svg>
    </div>
  );
}

// ── Section ────────────────────────────────────────────────────────────────

export function AISection() {
  return (
    <section className="landing-dark relative py-28 overflow-hidden bg-[#07070a]">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 55% 40% at 50% 50%, rgba(6,182,212,0.04) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* ── Header ── */}
        <FadeUp className="text-center mb-16">
          <p className="text-[12px] font-semibold text-cyan-400 uppercase tracking-[0.14em] mb-4">
            AI Orchestration
          </p>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white mb-5 leading-[1.08]">
            IA que orquesta.
            <br />
            <span className="bg-gradient-to-r from-cyan-400 via-violet-400 to-emerald-400 bg-clip-text text-transparent">
              Tú que cierras.
            </span>
          </h2>
          <p className="max-w-lg mx-auto text-zinc-400 text-lg leading-relaxed">
            Cada mensaje es clasificado, enrutado y respondido por IA en menos de 3 segundos.
            Sin cuellos de botella. Sin mensajes perdidos.
          </p>
        </FadeUp>

        {/* ── Pipeline steps ── */}
        <FadeUp delay={0.1} className="mb-12">
          <div className="flex flex-col lg:flex-row items-stretch gap-3 lg:gap-0">
            {pipelineSteps.map((step, i) => (
              <React.Fragment key={step.id}>
                <PipelineStepCard step={step} />
                {i < pipelineSteps.length - 1 && (
                  <StepConnector color={pipelineSteps[i + 1].color} />
                )}
              </React.Fragment>
            ))}
          </div>
        </FadeUp>

        {/* ── Live decisions ── */}
        <FadeUp delay={0.2} className="mb-12">
          <LiveDecisions />
        </FadeUp>

        {/* ── Stats row ── */}
        <motion.div
          variants={staggerFast}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
          className="grid grid-cols-3 gap-4"
        >
          {aiStats.map((s) => (
            <motion.div
              key={s.label}
              variants={fadeUpSm}
              className="text-center py-6 rounded-2xl"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <p className="text-3xl sm:text-4xl font-bold text-white mb-1 tabular-nums">
                {s.value}
              </p>
              <p className="text-xs sm:text-sm text-zinc-500">{s.label}</p>
            </motion.div>
          ))}
        </motion.div>

      </div>
    </section>
  );
}

// ── Pipeline step card ─────────────────────────────────────────────────────

function PipelineStepCard({ step }: { step: PipelineStep }) {
  return (
    <motion.div
      className="flex-1 relative rounded-2xl p-5 flex flex-col gap-3"
      style={{
        background: `linear-gradient(135deg, rgba(${step.rgb},0.05) 0%, transparent 60%), #0c0c12`,
        border: `1px solid rgba(${step.rgb},0.15)`,
      }}
      whileHover={{
        scale: 1.02,
        boxShadow: `0 0 24px -4px rgba(${step.rgb},0.18)`,
        transition: { duration: 0.18 },
      }}
    >
      <div className="flex items-center justify-between">
        <div
          className="h-9 w-9 rounded-xl flex items-center justify-center"
          style={{
            background: `rgba(${step.rgb},0.10)`,
            border: `1px solid rgba(${step.rgb},0.20)`,
            color: step.color,
          }}
        >
          {step.icon}
        </div>
        <span
          className="text-[9px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: `rgba(${step.rgb},0.08)`, color: step.color }}
        >
          PASO {step.step}
        </span>
      </div>

      <div>
        <p className="text-[13px] font-semibold text-zinc-100 mb-1">{step.label}</p>
        <p className="text-[11px] text-zinc-500 leading-snug">{step.desc}</p>
      </div>

      <div
        className="absolute bottom-0 inset-x-4 h-px rounded-full"
        style={{
          background: `linear-gradient(to right, transparent, rgba(${step.rgb},0.4), transparent)`,
        }}
      />
    </motion.div>
  );
}

// ── Live decisions panel ───────────────────────────────────────────────────

function LiveDecisions() {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "#0a0a0f", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="h-5 w-5 rounded-md flex items-center justify-center"
            style={{ background: "rgba(6,182,212,0.12)", border: "1px solid rgba(6,182,212,0.20)" }}
          >
            <svg className="h-3 w-3 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3" />
            </svg>
          </div>
          <span className="text-[12px] font-semibold text-zinc-200">
            Decisiones IA en tiempo real
          </span>
          <span
            className="px-1.5 py-0.5 rounded-full text-[9px] font-bold"
            style={{ background: "rgba(6,182,212,0.12)", color: "#06b6d4", border: "1px solid rgba(6,182,212,0.20)" }}
          >
            EN VIVO
          </span>
        </div>
        <span className="text-[10px] text-zinc-600 hidden sm:block">Últimas decisiones</span>
      </div>

      {/* Column headers */}
      <div
        className="hidden sm:grid grid-cols-[40px_1fr_90px_80px_36px] gap-3 px-4 py-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
      >
        {["Canal", "Mensaje", "Intención", "Acción", ""].map((h) => (
          <span key={h} className="text-[9px] uppercase tracking-wider text-zinc-600">{h}</span>
        ))}
      </div>

      {/* Rows */}
      <motion.div
        variants={staggerMed}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-40px" }}
      >
        {decisions.map((d, i) => {
          const color  = chColor[d.ch] ?? "#71717a";
          const intent = intentStyle[d.intent] ?? { bg: "rgba(255,255,255,0.06)", text: "#71717a" };
          const action = actionMeta[d.action];
          return (
            <motion.div
              key={i}
              variants={fadeUpSm}
              className="flex sm:grid sm:grid-cols-[40px_1fr_90px_80px_36px] gap-3 px-4 py-2.5 items-center"
              style={{
                borderBottom: i < decisions.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none",
              }}
            >
              <span
                className="px-1.5 py-0.5 rounded text-[8px] font-bold shrink-0"
                style={{ background: `${color}14`, color, border: `1px solid ${color}25` }}
              >
                {chLabel[d.ch]}
              </span>

              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-semibold text-zinc-300">{d.name} </span>
                <span className="text-[10px] text-zinc-500">{d.text}</span>
              </div>

              <span
                className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[9px] font-medium whitespace-nowrap"
                style={{ background: intent.bg, color: intent.text }}
              >
                {d.intent}
              </span>

              <span
                className="px-2 py-0.5 rounded-full text-[9px] font-medium whitespace-nowrap"
                style={{ background: action.bg, color: action.text }}
              >
                {action.label}
              </span>

              <span className="text-[9px] text-zinc-600 text-right whitespace-nowrap hidden sm:block">
                {d.time}
              </span>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
