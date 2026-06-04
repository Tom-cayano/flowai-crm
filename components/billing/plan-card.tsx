"use client";

import { useState } from "react";
import { Check, Loader2, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Plan, BillingInterval, PlanId } from "@/types/billing";
import { formatPlanPrice } from "@/lib/billing/plans";

const PLAN_ORDER: PlanId[] = ["starter", "pro", "agency", "enterprise"];

interface PlanCardProps {
  plan:            Plan;
  currentPlanId:   string;
  interval:        BillingInterval;
  workspaceId:     string;
  onUpgrade?:      (planId: string) => void;
}

const PLAN_GRADIENT: Record<string, string> = {
  starter:    "from-slate-500/10 to-slate-400/5",
  pro:        "from-blue-500/10 to-blue-400/5",
  agency:     "from-purple-500/10 to-purple-400/5",
  enterprise: "from-amber-500/10 to-amber-400/5",
};

const PLAN_ACCENT: Record<string, string> = {
  starter:    "border-slate-500/20",
  pro:        "border-blue-500/30",
  agency:     "border-purple-500/30",
  enterprise: "border-amber-500/30",
};

const FEATURE_LABELS: Record<string, string> = {
  whatsapp:              "WhatsApp Business",
  ai_replies:            "Respuestas IA automáticas",
  basic_automations:     "Automatizaciones básicas",
  advanced_automations:  "Automatizaciones avanzadas",
  inbox:                 "Inbox multiagente",
  analytics:             "Analytics avanzados",
  bulk_messaging:        "Mensajería masiva",
  api_access:            "Acceso a API",
  white_label:           "White label",
  sub_workspaces:        "Sub-workspaces",
  agency_dashboard:      "Dashboard de agencia",
  sso:                   "SSO empresarial",
  custom_integrations:   "Integraciones custom",
  sla:                   "SLA garantizado",
};

export function PlanCard({
  plan,
  currentPlanId,
  interval,
  workspaceId,
  onUpgrade,
}: PlanCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const isCurrent    = plan.id === currentPlanId;
  const isEnterprise = plan.id === "enterprise";
  const isDowngrade  =
    PLAN_ORDER.indexOf(plan.id as PlanId) < PLAN_ORDER.indexOf(currentPlanId as PlanId);

  const handleSelect = async () => {
    if (isCurrent) return;

    if (isEnterprise) {
      window.location.href = "mailto:mentedelfuturo1.0@gmail.com";
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/billing/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ planId: plan.id, interval, workspaceId }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "No se pudo iniciar el proceso de pago");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
      onUpgrade?.(plan.id);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative flex flex-col rounded-2xl border bg-gradient-to-b p-6",
        PLAN_GRADIENT[plan.id],
        PLAN_ACCENT[plan.id],
        isCurrent && "ring-2 ring-offset-2 ring-offset-background"
      )}
      style={isCurrent ? { "--tw-ring-color": "var(--brand)" } as React.CSSProperties : undefined}
    >
      {isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge
            className="text-[#030712] text-[10px] px-2"
            style={{ backgroundColor: "var(--brand)" }}
          >
            Plan actual
          </Badge>
        </div>
      )}

      {plan.id === "pro" && !isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-blue-500 text-white text-[10px] px-2">Más popular</Badge>
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>
      </div>

      <div className="mb-6">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-foreground">
            {isEnterprise ? "Custom" : formatPlanPrice(plan, interval)}
          </span>
          {!isEnterprise && (
            <span className="text-xs text-muted-foreground">
              /{interval === "yearly" ? "año" : "mes"}
            </span>
          )}
        </div>
        {interval === "yearly" && !isEnterprise && (
          <p className="text-[11px] text-emerald-400 mt-0.5">
            Ahorra {Math.round(100 - (plan.priceYearly / (plan.priceMonthly * 12)) * 100)}% vs mensual
          </p>
        )}
      </div>

      {/* Quotas */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        <QuotaItem label="Agentes" value={plan.maxSeats >= 999 ? "Ilimitados" : `${plan.maxSeats}`} />
        <QuotaItem
          label="Mensajes/mes"
          value={plan.maxMessagesMonthly >= 99999 ? "Ilimitados" : plan.maxMessagesMonthly.toLocaleString()}
        />
        <QuotaItem
          label="Créditos IA"
          value={plan.maxAiCredits >= 99999 ? "Ilimitados" : plan.maxAiCredits.toLocaleString()}
        />
        <QuotaItem
          label="Automatizaciones"
          value={plan.maxAutomations >= 9999 ? "Ilimitadas" : `${plan.maxAutomations}`}
        />
      </div>

      {/* Features */}
      <ul className="space-y-1.5 mb-6 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-xs text-foreground/80">
            <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--brand)" }} />
            {FEATURE_LABELS[f] ?? f}
          </li>
        ))}
      </ul>

      <Button
        onClick={handleSelect}
        disabled={isCurrent || loading}
        variant={isCurrent ? "outline" : "default"}
        className={cn("w-full text-sm", !isCurrent && !isEnterprise && "text-[#030712]")}
        style={!isCurrent && !isEnterprise ? { backgroundColor: "var(--brand)" } : undefined}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isEnterprise ? (
          <>
            <Zap className="h-3.5 w-3.5 mr-1.5" />
            Contactar ventas
          </>
        ) : isCurrent ? (
          "Plan actual"
        ) : isDowngrade ? (
          "Cambiar a este plan"
        ) : (
          "Seleccionar plan"
        )}
      </Button>

      {error && (
        <p className="text-[11px] text-red-400 text-center mt-2">{error}</p>
      )}
    </motion.div>
  );
}

function QuotaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background/40 px-2.5 py-1.5">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-xs font-semibold text-foreground">{value}</p>
    </div>
  );
}
