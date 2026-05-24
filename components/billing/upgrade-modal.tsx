"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, X, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LimitKind = "seats" | "ai_credits" | "automations" | "messages" | "feature" | "plan";

interface UpgradeModalProps {
  open:        boolean;
  onClose:     () => void;
  kind?:       LimitKind;
  featureName?: string;
  currentPlan?: string;
  current?:    number;
  limit?:      number;
  workspaceId: string;
}

const COPY: Record<LimitKind, { title: string; body: string }> = {
  seats:       { title: "Límite de agentes alcanzado",        body: "Tu plan actual no permite añadir más agentes. Actualiza para agregar a tu equipo." },
  ai_credits:  { title: "Créditos de IA agotados",           body: "Alcanzaste el límite mensual de créditos de IA. Actualiza para continuar usando el copiloto." },
  automations: { title: "Límite de automatizaciones",         body: "Alcanzaste el número máximo de automatizaciones de tu plan. Actualiza para crear más." },
  messages:    { title: "Límite de mensajes alcanzado",       body: "Alcanzaste el límite mensual de mensajes. Actualiza para enviar más." },
  feature:     { title: "Funcionalidad no disponible",        body: "Esta funcionalidad no está incluida en tu plan actual. Actualiza para desbloquearla." },
  plan:        { title: "Plan insuficiente",                  body: "Esta acción requiere un plan superior. Actualiza para continuar." },
};

export function UpgradeModal({
  open,
  onClose,
  kind = "feature",
  featureName,
  currentPlan,
  current,
  limit,
  workspaceId,
}: UpgradeModalProps) {
  const router  = useRouter();
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const copy = COPY[kind];

  const handleUpgrade = async () => {
    setLoading(true);
    router.push("/settings/billing");
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Icon */}
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center mb-4"
          style={{
            backgroundColor: "color-mix(in srgb, var(--brand) 12%, transparent)",
            border:          "1px solid color-mix(in srgb, var(--brand) 25%, transparent)",
          }}
        >
          <Zap className="h-5 w-5" style={{ color: "var(--brand)" }} />
        </div>

        <h2 className="text-base font-semibold text-foreground mb-2">
          {featureName ? `Desbloquea ${featureName}` : copy.title}
        </h2>
        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
          {copy.body}
        </p>

        {/* Usage bar when showing a hard limit */}
        {current !== undefined && limit !== undefined && limit > 0 && (
          <div className="mb-5 p-3 rounded-xl bg-muted/50 border border-border">
            <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
              <span>Uso actual</span>
              <span className="font-medium text-foreground">{current} / {limit}</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-red-500"
                style={{ width: `${Math.min(100, (current / limit) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {currentPlan && (
          <p className="text-[11px] text-muted-foreground mb-4">
            Plan actual: <span className="font-medium text-foreground">{currentPlan}</span>
          </p>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="flex-1"
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            className={cn("flex-1 text-[#030712] font-semibold")}
            style={{ backgroundColor: "var(--brand)" }}
            onClick={handleUpgrade}
            disabled={loading}
          >
            {loading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <>Ver planes <ArrowRight className="h-3.5 w-3.5 ml-1.5" /></>}
          </Button>
        </div>
      </div>
    </div>
  );
}
