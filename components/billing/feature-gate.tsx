"use client";

// Wraps a UI section that requires a specific plan feature.
// In dev with PLAN_GATE_BYPASS, shows content normally.
// In production with an insufficient plan, renders a locked overlay.
//
// Usage:
//   <FeatureGate feature="white_label" planId={subscription.planId} label="White Label">
//     <WhiteLabelSettings />
//   </FeatureGate>

import { useState } from "react";
import { Lock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { planHasFeature } from "@/lib/billing/plans";
import type { PlanFeature } from "@/types/billing";

interface FeatureGateProps {
  feature:     PlanFeature;
  planId:      string;
  label?:      string;
  children:    React.ReactNode;
  // Optional: render entirely different content when locked instead of overlay
  fallback?:   React.ReactNode;
}

export function FeatureGate({ feature, planId, label, children, fallback }: FeatureGateProps) {
  const hasFeature = planHasFeature(planId, feature);
  if (hasFeature) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  return <LockedOverlay feature={feature} label={label} />;
}

// ─── Locked overlay — blurs content and shows an upgrade prompt ───────────────

interface LockedOverlayProps {
  feature:  PlanFeature;
  label?:   string;
}

const FEATURE_LABELS: Partial<Record<PlanFeature, string>> = {
  white_label:          "White Label",
  analytics:            "Analytics avanzados",
  api_access:           "Acceso a API",
  bulk_messaging:       "Mensajería masiva",
  agency_dashboard:     "Dashboard de agencia",
  sub_workspaces:       "Sub-workspaces",
  sso:                  "SSO empresarial",
  custom_integrations:  "Integraciones custom",
  advanced_automations: "Automatizaciones avanzadas",
};

const FEATURE_PLAN_REQUIRED: Partial<Record<PlanFeature, string>> = {
  white_label:          "Agency",
  analytics:            "Pro",
  api_access:           "Pro",
  bulk_messaging:       "Pro",
  agency_dashboard:     "Agency",
  sub_workspaces:       "Agency",
  sso:                  "Enterprise",
  advanced_automations: "Pro",
};

function LockedOverlay({ feature, label }: LockedOverlayProps) {
  const [clicked, setClicked] = useState(false);
  const name        = label ?? FEATURE_LABELS[feature] ?? feature;
  const planRequired = FEATURE_PLAN_REQUIRED[feature] ?? "Pro";

  return (
    <div className="relative rounded-2xl border border-border overflow-hidden">
      {/* Blurred placeholder content */}
      <div className="select-none pointer-events-none" aria-hidden>
        <div className="h-48 bg-muted/30 blur-sm" />
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-[2px]">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center"
          style={{
            backgroundColor: "color-mix(in srgb, var(--brand) 12%, transparent)",
            border:          "1px solid color-mix(in srgb, var(--brand) 25%, transparent)",
          }}
        >
          <Lock className="h-5 w-5" style={{ color: "var(--brand)" }} />
        </div>

        <div className="text-center px-4">
          <p className="text-sm font-semibold text-foreground">{name}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Disponible en el plan{" "}
            <span className="font-medium text-foreground">{planRequired}</span> o superior
          </p>
        </div>

        <Button
          size="sm"
          className="text-[#030712] font-semibold h-8"
          style={{ backgroundColor: "var(--brand)" }}
          onClick={() => {
            setClicked(true);
            window.location.href = "/settings/billing";
          }}
        >
          <Zap className="h-3.5 w-3.5 mr-1.5" />
          {clicked ? "Redirigiendo…" : "Actualizar plan"}
        </Button>
      </div>
    </div>
  );
}

// ─── Inline locked badge (for menu items, buttons) ────────────────────────────

interface LockedBadgeProps {
  feature: PlanFeature;
  planId:  string;
}

export function LockedBadge({ feature, planId }: LockedBadgeProps) {
  if (planHasFeature(planId, feature)) return null;
  const planRequired = FEATURE_PLAN_REQUIRED[feature] ?? "Pro";
  return (
    <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded px-1.5 py-0.5">
      <Lock className="h-2.5 w-2.5" />
      {planRequired}
    </span>
  );
}
