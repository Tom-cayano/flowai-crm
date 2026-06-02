"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Minus, ShieldCheck, CreditCard, Globe, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeUp } from "./motion-section";
import { cn } from "@/lib/utils";

// ─── Plan data ──────────────────────────────────────────────────────────────

interface Plan {
  name: string;
  tagline: string;
  monthlyPrice: string;
  annualPrice: string;
  annualTotal?: string;
  period: string;
  description: string;
  cta: string;
  ctaHref: string;
  badge?: string;
  tier: "starter" | "pro" | "agency" | "enterprise";
  features: string[];
  unavailable?: string[];
}

const plans: Plan[] = [
  {
    name: "Starter",
    tagline: "Para empezar hoy",
    monthlyPrice: "19€",
    annualPrice: "15€",
    annualTotal: "180€/año",
    period: "/mes",
    description: "Todo lo esencial para gestionar tus conversaciones de WhatsApp.",
    cta: "Empezar gratis",
    ctaHref: "/signup",
    tier: "starter",
    features: [
      "1 número de WhatsApp",
      "3 agentes incluidos",
      "1.000 conversaciones / mes",
      "Bandeja compartida",
      "Automatizaciones básicas",
      "Soporte por email",
    ],
    unavailable: ["IA integrada", "Campañas masivas", "Analítica avanzada"],
  },
  {
    name: "Pro",
    tagline: "El más elegido",
    monthlyPrice: "59€",
    annualPrice: "47€",
    annualTotal: "564€/año",
    period: "/mes",
    description: "Todo lo que necesitas para vender más con WhatsApp.",
    cta: "Empezar 14 días gratis",
    ctaHref: "/signup",
    badge: "Más popular",
    tier: "pro",
    features: [
      "3 números de WhatsApp",
      "Agentes ilimitados",
      "Conversaciones ilimitadas",
      "IA integrada",
      "Automatizaciones avanzadas",
      "Campañas masivas",
      "Analítica avanzada",
      "Integraciones (Zapier, CRM)",
      "Soporte prioritario",
    ],
  },
  {
    name: "Agency",
    tagline: "Para agencias y equipos",
    monthlyPrice: "149€",
    annualPrice: "119€",
    annualTotal: "1.428€/año",
    period: "/mes",
    description: "Multi-workspace, white-label y control total para agencias.",
    cta: "Empezar 14 días gratis",
    ctaHref: "/signup",
    badge: "Para agencias",
    tier: "agency",
    features: [
      "Todo lo del plan Pro",
      "Multi-workspace",
      "White-label completo",
      "Roles y permisos avanzados",
      "API y webhooks",
      "Sub-cuentas de clientes",
      "Dashboards avanzados",
      "Soporte prioritario 24/7",
    ],
  },
  {
    name: "Enterprise",
    tagline: "A tu medida",
    monthlyPrice: "Custom",
    annualPrice: "Custom",
    period: "",
    description: "Infraestructura dedicada y soporte exclusivo para grandes organizaciones.",
    cta: "Hablar con ventas",
    ctaHref: "#contact",
    tier: "enterprise",
    features: [
      "Todo lo del plan Agency",
      "Infraestructura dedicada",
      "SLA garantizado",
      "SSO / SAML",
      "Seguridad avanzada",
      "Onboarding dedicado",
      "Manager exclusivo",
    ],
  },
];

// ─── Trust badges ────────────────────────────────────────────────────────────

const trust = [
  { icon: ShieldCheck, label: "Sin tarjeta de crédito" },
  { icon: Zap,         label: "14 días gratis en Pro y Agency" },
  { icon: Globe,       label: "Datos en servidores de la UE" },
  { icon: CreditCard,  label: "Cancela cuando quieras" },
];

// ─── Helper ──────────────────────────────────────────────────────────────────

function CheckIcon({ tier }: { tier: Plan["tier"] }) {
  return (
    <Check
      className={cn(
        "h-3.5 w-3.5 mt-0.5 shrink-0",
        tier === "pro"
          ? "text-[#10b981]"
          : tier === "agency"
          ? "text-[#06b6d4]"
          : "text-zinc-500"
      )}
    />
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="py-28 relative bg-[#09090b]">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

      {/* Subtle background glow centered on Pro */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 40% 35% at 50% 55%, rgba(16,185,129,0.05) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ── Header ── */}
        <FadeUp className="text-center mb-14">
          <p className="text-[13px] font-medium text-[#10b981] uppercase tracking-[0.12em] mb-3">
            Precios
          </p>
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight mb-5">
            Empieza gratis.
            <br />
            <span className="bg-gradient-to-r from-[#10b981] to-[#06b6d4] bg-clip-text text-transparent">
              Escala cuando estés listo.
            </span>
          </h2>
          <p className="max-w-xl mx-auto text-zinc-400 text-lg mb-10">
            Sin costes ocultos. Sin permanencia. El plan Pro lo usa la mayoría de nuestros clientes
            desde el primer mes.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.07]">
            <button
              onClick={() => setAnnual(false)}
              className={cn(
                "px-5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
                !annual
                  ? "bg-white/[0.09] text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Mensual
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={cn(
                "flex items-center gap-2 px-5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
                annual
                  ? "bg-white/[0.09] text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Anual
              <span className="text-[10px] font-bold text-[#10b981] bg-[#10b981]/10 border border-[#10b981]/20 px-1.5 py-0.5 rounded-full leading-none">
                −20%
              </span>
            </button>
          </div>
        </FadeUp>

        {/* ── Cards ── */}
        {/*
          Use motion.div with `animate` (not `whileInView`) so cards are always
          visible on mount. `whileInView` has a known race condition on page-top
          content: the IntersectionObserver fires before framer-motion attaches,
          causing the "enter" event to be missed and cards to stay at opacity:0.
        */}
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
          {plans.map((plan, i) => {
            const isPro      = plan.tier === "pro";
            const isAgency   = plan.tier === "agency";
            const isEnterprise = plan.tier === "enterprise";
            const price      = annual ? plan.annualPrice : plan.monthlyPrice;

            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: i * 0.07, ease: [0.21, 1.02, 0.73, 0.98] }}
              >
                <div
                  className={cn(
                    "relative flex flex-col rounded-2xl border transition-all duration-300 overflow-hidden",
                    isPro
                      ? "border-[#10b981]/35 bg-gradient-to-b from-[#0d1f16] via-[#0b1a12] to-[#09090b] shadow-[0_0_80px_-16px_rgba(16,185,129,0.22)] hover:shadow-[0_0_100px_-12px_rgba(16,185,129,0.28)] hover:border-[#10b981]/50"
                      : isAgency
                      ? "border-[#06b6d4]/20 bg-gradient-to-b from-[#0b191f] to-[#09090b] hover:border-[#06b6d4]/35 hover:bg-[#0d1e26]/80"
                      : isEnterprise
                      ? "border-white/[0.08] bg-[#0f0f12] hover:border-white/[0.14] hover:bg-[#111117]"
                      : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.11] hover:bg-white/[0.04]"
                  )}
                >
                  {/* Pro top accent bar */}
                  {isPro && (
                    <div className="h-0.5 w-full bg-gradient-to-r from-[#10b981] to-[#06b6d4]" />
                  )}
                  {isAgency && (
                    <div className="h-0.5 w-full bg-gradient-to-r from-[#06b6d4]/60 to-[#8b5cf6]/60" />
                  )}

                  <div className="p-6 flex flex-col flex-1">
                    {/* Badge */}
                    {plan.badge && (
                      <div className="mb-4">
                        <span
                          className={cn(
                            "inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase",
                            isPro
                              ? "bg-[#10b981]/15 border border-[#10b981]/25 text-[#10b981]"
                              : "bg-[#06b6d4]/10 border border-[#06b6d4]/20 text-[#06b6d4]"
                          )}
                        >
                          {plan.badge}
                        </span>
                      </div>
                    )}

                    {/* Plan name + tagline */}
                    <div className="mb-5">
                      <h3
                        className={cn(
                          "text-base font-bold mb-0.5",
                          isPro ? "text-white" : "text-zinc-200"
                        )}
                      >
                        {plan.name}
                      </h3>
                      <p className="text-[11px] text-zinc-500 font-medium">{plan.tagline}</p>
                    </div>

                    {/* Price */}
                    <div className="mb-1">
                      <div className="flex items-baseline gap-1">
                        <span
                          className={cn(
                            "font-bold leading-none tracking-tight",
                            isEnterprise ? "text-2xl text-zinc-300" : "text-[36px]",
                            isPro
                              ? "bg-gradient-to-br from-white to-zinc-300 bg-clip-text text-transparent"
                              : "text-white"
                          )}
                        >
                          {price}
                        </span>
                        {plan.period && (
                          <span className="text-sm text-zinc-500 font-medium">{plan.period}</span>
                        )}
                      </div>
                      {annual && plan.annualTotal && (
                        <p
                          className={cn(
                            "text-[11px] mt-1.5 font-medium",
                            isPro ? "text-[#10b981]" : "text-[#06b6d4]"
                          )}
                        >
                          Facturado como {plan.annualTotal} · ahorras un 20%
                        </p>
                      )}
                      {!annual && plan.tier !== "starter" && plan.tier !== "enterprise" && (
                        <p className="text-[11px] mt-1.5 text-zinc-600">
                          O{" "}
                          <button
                            onClick={() => setAnnual(true)}
                            className="text-[#10b981] hover:underline font-medium"
                          >
                            {plan.annualPrice}/mes con el plan anual
                          </button>
                        </p>
                      )}
                    </div>

                    <p className="text-[12px] text-zinc-500 leading-relaxed mb-6 mt-3">
                      {plan.description}
                    </p>

                    {/* CTA */}
                    <Button
                      asChild
                      className={cn(
                        "w-full mb-6 font-semibold text-[13px] h-10 transition-all duration-200",
                        isPro
                          ? "bg-[#10b981] text-[#030712] hover:bg-[#0ea572] shadow-lg shadow-[#10b981]/20 hover:shadow-[#10b981]/30 hover:scale-[1.02]"
                          : isAgency
                          ? "bg-[#06b6d4]/10 border border-[#06b6d4]/30 text-[#06b6d4] hover:bg-[#06b6d4]/20 hover:border-[#06b6d4]/50"
                          : isEnterprise
                          ? "bg-white/[0.07] border border-white/[0.12] text-zinc-200 hover:bg-white/[0.11] hover:text-white"
                          : "bg-white/[0.05] border border-white/[0.09] text-zinc-300 hover:bg-white/[0.09] hover:text-white"
                      )}
                      variant="default"
                    >
                      <Link href={plan.ctaHref}>{plan.cta}</Link>
                    </Button>

                    {/* Divider */}
                    <div
                      className={cn(
                        "h-px mb-6",
                        isPro
                          ? "bg-gradient-to-r from-transparent via-[#10b981]/20 to-transparent"
                          : isAgency
                          ? "bg-gradient-to-r from-transparent via-[#06b6d4]/15 to-transparent"
                          : "bg-white/[0.06]"
                      )}
                    />

                    {/* Features */}
                    <ul className="space-y-2.5 flex-1">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5">
                          <CheckIcon tier={plan.tier} />
                          <span className="text-[13px] text-zinc-400 leading-snug">{f}</span>
                        </li>
                      ))}
                      {plan.unavailable?.map((f) => (
                        <li key={f} className="flex items-start gap-2.5 opacity-30">
                          <Minus className="h-3.5 w-3.5 mt-0.5 shrink-0 text-zinc-600" />
                          <span className="text-[13px] text-zinc-600 leading-snug">{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ── Trust badges ── */}
        <FadeUp delay={0.15} className="mt-10">
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
            {trust.map((t) => (
              <div key={t.label} className="flex items-center gap-2 text-zinc-500">
                <t.icon className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
                <span className="text-[12px]">{t.label}</span>
              </div>
            ))}
          </div>
        </FadeUp>

        {/* ── Bottom note ── */}
        <FadeUp delay={0.2} className="text-center mt-6">
          <p className="text-[13px] text-zinc-600">
            ¿Tienes un equipo grande o necesidades especiales?{" "}
            <a href="#contact" className="text-[#10b981] hover:text-[#34d399] transition-colors font-medium">
              Habla con nuestro equipo de ventas →
            </a>
          </p>
        </FadeUp>
      </div>
    </section>
  );
}
