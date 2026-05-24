"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const easing = [0.21, 1.02, 0.73, 0.98] as const;

const trust = [
  { value: "+3.200", label: "empresas activas" },
  { value: "98%", label: "satisfacción" },
  { value: "−60%", label: "tiempo de respuesta" },
  { value: "4,9★", label: "valoración media" },
];

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background layers */}
      <div className="absolute inset-0 bg-[#09090b]" />

      {/* Radial glow — top center */}
      <div
        className="absolute inset-x-0 top-0 h-[600px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(16,185,129,0.09) 0%, transparent 70%)",
        }}
      />

      {/* Subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      {/* Noise texture overlay */}
      <div className="absolute inset-0 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-24 text-center">
        {/* Badge */}
        <motion.div
          className="flex justify-center mb-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: easing }}
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#10b981]/20 bg-[#10b981]/5 text-[#10b981] text-xs font-medium">
            <Sparkles className="h-3 w-3" />
            Automatizaciones con IA · Ahora en versión 2.0
          </div>
        </motion.div>

        {/* Headline */}
        <motion.h1
          className="text-[52px] sm:text-[72px] lg:text-[84px] font-bold tracking-tight leading-[1.02] text-white mb-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.08, ease: easing }}
        >
          La IA que convierte
          <br />
          <span className="bg-gradient-to-r from-[#10b981] via-[#34d399] to-[#06b6d4] bg-clip-text text-transparent">
            WhatsApp en ingresos.
          </span>
        </motion.h1>

        {/* Description */}
        <motion.p
          className="max-w-2xl mx-auto text-lg sm:text-xl text-zinc-400 leading-relaxed mb-10"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.16, ease: easing }}
        >
          Centraliza conversaciones, automatiza respuestas con IA y cierra más ventas.
          Todo desde una plataforma diseñada para equipos que usan WhatsApp Business.
        </motion.p>

        {/* CTAs */}
        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-14"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.24, ease: easing }}
        >
          <Button
            size="lg"
            asChild
            className="h-12 px-7 bg-[#10b981] text-[#030712] hover:bg-[#0ea572] font-semibold text-[15px] shadow-lg shadow-[#10b981]/15 transition-all duration-200 hover:shadow-[#10b981]/25 hover:scale-[1.02]"
          >
            <Link href="/signup">
              Empieza gratis — sin tarjeta
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            asChild
            className="h-12 px-7 border-white/10 text-zinc-300 hover:border-white/20 hover:bg-white/[0.04] hover:text-white font-medium text-[15px] transition-all duration-200"
          >
            <Link href="#features">Ver funcionalidades</Link>
          </Button>
        </motion.div>

        {/* Trust stats */}
        <motion.div
          className="flex flex-wrap items-center justify-center gap-8 sm:gap-12 mb-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.32 }}
        >
          {trust.map((t) => (
            <div key={t.label} className="flex flex-col items-center gap-0.5">
              <span className="text-2xl font-bold bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent">
                {t.value}
              </span>
              <span className="text-xs text-zinc-500">{t.label}</span>
            </div>
          ))}
        </motion.div>

        {/* Dashboard preview */}
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: easing }}
        >
          <div className="mx-auto max-w-[900px] rounded-2xl overflow-hidden border border-white/[0.07] shadow-2xl shadow-black/60"
            style={{ background: "linear-gradient(180deg, #18181b 0%, #111116 100%)" }}
          >
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] bg-[#0c0c10]">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              </div>
              <div className="flex-1 mx-4 h-6 rounded-md bg-white/[0.04] border border-white/[0.06] flex items-center px-3 gap-2">
                <div className="h-2 w-2 rounded-full bg-[#10b981]/50" />
                <span className="text-[10px] text-zinc-500 font-mono">app.flowai.io/conversaciones</span>
              </div>
            </div>

            {/* App layout */}
            <div className="flex h-80">
              {/* Sidebar */}
              <div className="w-14 flex-shrink-0 bg-[#0c0c10] border-r border-white/[0.05] flex flex-col items-center py-4 gap-4">
                {/* Logo mark */}
                <div className="h-7 w-7 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                    <defs>
                      <linearGradient id="sg" x1="5" y1="23" x2="27" y2="4" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#06b6d4" />
                      </linearGradient>
                    </defs>
                    <circle cx="16" cy="15" r="7.5" stroke="url(#sg)" strokeWidth="0.75" strokeOpacity="0.25" fill="none" />
                    <line x1="16" y1="11" x2="16" y2="8" stroke="url(#sg)" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="19.3" y1="17.2" x2="22.9" y2="19.6" stroke="url(#sg)" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="12.7" y1="17.2" x2="9.1" y2="19.6" stroke="url(#sg)" strokeWidth="1.5" strokeLinecap="round" />
                    <circle cx="16" cy="5.5" r="2.5" fill="url(#sg)" />
                    <circle cx="25" cy="21.5" r="2.5" fill="#06b6d4" />
                    <circle cx="7" cy="21.5" r="2.5" fill="#10b981" />
                    <circle cx="16" cy="15" r="4" fill="url(#sg)" />
                  </svg>
                </div>
                {/* Nav icons */}
                {[
                  "M3 12h18M3 6h18M3 18h18",
                  "M8 12h8M8 6h8M8 18h6",
                  "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2",
                  "M22 12h-4l-3 9L9 3l-3 9H2",
                ].map((d, i) => (
                  <div
                    key={i}
                    className={`h-8 w-8 rounded-lg flex items-center justify-center ${i === 0 ? "bg-[#10b981]/10" : ""}`}
                  >
                    <svg className={`h-4 w-4 ${i === 0 ? "text-[#10b981]" : "text-zinc-600"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                ))}
              </div>

              {/* Conversation list */}
              <div className="w-64 flex-shrink-0 bg-[#111116] border-r border-white/[0.05] flex flex-col">
                <div className="px-3 py-3 border-b border-white/[0.05]">
                  <div className="h-7 rounded-lg bg-white/[0.04] border border-white/[0.04]" />
                </div>
                <div className="flex-1 overflow-hidden py-2">
                  {[
                    { name: "Carlos Mendoza", msg: "Hola, ¿cuándo puedo...", time: "2m", dot: "#10b981", active: true },
                    { name: "Ana García", msg: "Recibí la propuesta, grac...", time: "8m", dot: "#06b6d4", active: false },
                    { name: "Luis Paredes", msg: "¿Tienen integración con...", time: "15m", dot: "#f59e0b", active: false },
                    { name: "María Torres", msg: "Perfecto, confirmado para...", time: "1h", dot: "#8b5cf6", active: false },
                    { name: "Jorge Silva", msg: "Nos interesa el plan Pro...", time: "2h", dot: "#ec4899", active: false },
                  ].map((conv) => (
                    <div
                      key={conv.name}
                      className={`flex items-center gap-3 px-3 py-2.5 ${conv.active ? "bg-white/[0.05]" : ""}`}
                    >
                      <div
                        className="h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-semibold text-[#030712]"
                        style={{ background: `${conv.dot}40`, border: `1px solid ${conv.dot}30` }}
                      >
                        <span style={{ color: conv.dot }}>{conv.name.split(" ").map(n => n[0]).join("")}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[11px] font-medium text-zinc-200 truncate">{conv.name}</span>
                          <span className="text-[9px] text-zinc-600 flex-shrink-0 ml-1">{conv.time}</span>
                        </div>
                        <span className="text-[10px] text-zinc-500 truncate block">{conv.msg}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Chat window */}
              <div className="flex-1 flex flex-col bg-[#09090b]">
                {/* Chat header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] bg-[#111116]">
                  <div className="h-7 w-7 rounded-full bg-[#10b981]/20 flex items-center justify-center text-[10px] font-semibold text-[#10b981]">CM</div>
                  <div>
                    <p className="text-[11px] font-medium text-zinc-200">Carlos Mendoza</p>
                    <p className="text-[9px] text-zinc-500">En línea · +34 600 123 456</p>
                  </div>
                  <div className="ml-auto flex items-center gap-1.5">
                    <div className="h-5 px-2 rounded-full bg-[#10b981]/10 border border-[#10b981]/20 flex items-center">
                      <span className="text-[8px] font-medium text-[#10b981]">Abierta</span>
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 px-4 py-4 space-y-3 overflow-hidden">
                  <div className="flex justify-start">
                    <div className="max-w-[65%] bg-white/[0.05] border border-white/[0.05] rounded-2xl rounded-tl-sm px-3 py-2">
                      <p className="text-[11px] text-zinc-300">Hola, ¿cuándo puedo ver una demo del producto?</p>
                      <p className="text-[8px] text-zinc-600 mt-1">10:24</p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="max-w-[65%] bg-[#10b981]/10 border border-[#10b981]/15 rounded-2xl rounded-tr-sm px-3 py-2">
                      <p className="text-[11px] text-[#34d399]">¡Hola Carlos! Puedo mostrarte una demo hoy a las 16h. ¿Te viene bien?</p>
                      <p className="text-[8px] text-[#10b981]/60 mt-1 text-right">10:25 ✓✓</p>
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="max-w-[65%] bg-white/[0.05] border border-white/[0.05] rounded-2xl rounded-tl-sm px-3 py-2">
                      <p className="text-[11px] text-zinc-300">Perfecto, a las 16h me viene genial 👍</p>
                      <p className="text-[8px] text-zinc-600 mt-1">10:27</p>
                    </div>
                  </div>
                  {/* AI suggestion chip */}
                  <div className="flex items-center gap-2 pt-1">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#06b6d4]/8 border border-[#06b6d4]/15">
                      <div className="h-1.5 w-1.5 rounded-full bg-[#06b6d4] animate-pulse" />
                      <span className="text-[9px] text-[#06b6d4]">IA sugiere: Enviar recordatorio de demo</span>
                    </div>
                  </div>
                </div>

                {/* Input bar */}
                <div className="px-3 pb-3">
                  <div className="h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center px-3 gap-2">
                    <span className="text-[10px] text-zinc-600">Escribe un mensaje...</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Glow beneath preview */}
          <div
            className="absolute -bottom-16 inset-x-0 h-32 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse 60% 40% at 50% 100%, rgba(16,185,129,0.06), transparent)",
            }}
          />

          {/* Fade bottom */}
          <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-[#09090b] to-transparent pointer-events-none" />
        </motion.div>
      </div>
    </section>
  );
}
