"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { FadeUp } from "./motion-section";
import { staggerFast, fadeUpSm } from "@/lib/motion/presets";

// ── Trust badges ───────────────────────────────────────────────────────────

const trustBadges = [
  { label: "3.200+ equipos"       },
  { label: "G2 4.9 ★"             },
  { label: "Sin tarjeta de crédito" },
  { label: "Datos en la UE"       },
];

// ── Component ──────────────────────────────────────────────────────────────

export function CtaSection() {
  return (
    <section className="landing-dark relative py-32 overflow-hidden bg-[#07070a]">
      {/* Top separator */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />

      {/* Central emerald glow — tighter and more focused than before */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 55% at 50% 60%, rgba(16,185,129,0.09) 0%, rgba(16,185,129,0.03) 40%, transparent 70%)",
        }}
      />

      {/* Ambient edge glows */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 30% 40% at 15% 80%, rgba(6,182,212,0.04) 0%, transparent 65%), " +
            "radial-gradient(ellipse 30% 40% at 85% 80%, rgba(139,92,246,0.04) 0%, transparent 65%)",
        }}
      />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">

        {/* ── Trust badges row ── */}
        <motion.div
          variants={staggerFast}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
          className="flex flex-wrap items-center justify-center gap-2 mb-12"
        >
          {trustBadges.map((badge) => (
            <motion.span
              key={badge.label}
              variants={fadeUpSm}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#a1a1aa",
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ background: "#10b981", animation: "ld-pulse-glow 2s ease-in-out infinite" }}
              />
              {badge.label}
            </motion.span>
          ))}
        </motion.div>

        {/* ── Heading ── */}
        <FadeUp>
          <h2 className="text-4xl sm:text-[58px] font-bold text-white tracking-tight leading-[1.06] mb-6">
            El momento de vender más
            <br />
            <span className="bg-gradient-to-r from-[#10b981] via-[#34d399] to-[#06b6d4] bg-clip-text text-transparent">
              empieza ahora.
            </span>
          </h2>
        </FadeUp>

        <FadeUp delay={0.06}>
          <p className="text-lg sm:text-xl text-zinc-400 mb-12 max-w-xl mx-auto leading-relaxed">
            Únete a más de 3.200 equipos que convierten conversaciones
            en ingresos con FlowAI. Sin configuración complicada.
          </p>
        </FadeUp>

        {/* ── CTAs ── */}
        <FadeUp delay={0.12}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">

            {/* Primary */}
            <motion.div
              whileHover={{
                scale: 1.03,
                boxShadow: "0 0 28px -2px rgba(16,185,129,0.40), 0 8px 24px rgba(0,0,0,0.5)",
              }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
              style={{ borderRadius: "12px" }}
            >
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 h-12 px-8 rounded-xl text-[15px] font-bold bg-[#10b981] text-[#030712] hover:bg-[#0ea572] transition-colors duration-150"
                style={{ boxShadow: "0 0 0 1px rgba(16,185,129,0.35), 0 2px 8px rgba(0,0,0,0.4)" }}
              >
                Crear cuenta gratis
                <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>

            {/* Secondary — ghost */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
              style={{ borderRadius: "12px" }}
            >
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 h-12 px-7 rounded-xl text-[15px] font-medium text-zinc-400 hover:text-zinc-100 transition-colors duration-150"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.15)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.10)";
                }}
              >
                Ya tengo cuenta
                <ArrowRight className="h-3.5 w-3.5 opacity-50" />
              </Link>
            </motion.div>
          </div>

          {/* Trust micro-line */}
          <p className="text-[12px] text-zinc-600 flex items-center justify-center gap-3 flex-wrap">
            <span className="flex items-center gap-1">
              <svg className="h-3 w-3 text-emerald-500/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              14 días gratis
            </span>
            <span className="h-3 w-px bg-zinc-800" />
            <span className="flex items-center gap-1">
              <svg className="h-3 w-3 text-emerald-500/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Configuración en 5 minutos
            </span>
            <span className="h-3 w-px bg-zinc-800" />
            <span className="flex items-center gap-1">
              <svg className="h-3 w-3 text-emerald-500/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Cancela cuando quieras
            </span>
          </p>
        </FadeUp>

      </div>
    </section>
  );
}
