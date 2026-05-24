"use client";

import { useState, useEffect } from "react";
import {
  CreditCard, ExternalLink, Loader2, Shield, AlertTriangle,
  FileText, Download, Clock,
} from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlanCard } from "@/components/billing/plan-card";
import { UsageMeter } from "@/components/billing/usage-meter";
import { cn } from "@/lib/utils";
import type { Plan, BillingInterval } from "@/types/billing";
import type { WorkspaceSubscription } from "@/lib/billing/subscriptions";

interface BillingPageClientProps {
  workspaceId:  string;
  subscription: WorkspaceSubscription | null;
  plans:        Plan[];
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  trialing:   { label: "Prueba gratuita",   color: "text-blue-400 border-blue-400/30 bg-blue-400/10" },
  active:     { label: "Activa",            color: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10" },
  past_due:   { label: "Pago pendiente",    color: "text-red-400 border-red-400/30 bg-red-400/10" },
  canceled:   { label: "Cancelada",         color: "text-muted-foreground border-border bg-muted" },
  unpaid:     { label: "Sin pagar",         color: "text-red-400 border-red-400/30 bg-red-400/10" },
  incomplete: { label: "Incompleta",        color: "text-amber-400 border-amber-400/30 bg-amber-400/10" },
};

interface StripeInvoice {
  id:               string;
  number:           string | null;
  status:           string | null;
  amountPaid:       number;
  amountDue:        number;
  currency:         string;
  created:          number;
  hostedInvoiceUrl: string | null;
  invoicePdf:       string | null;
  periodStart:      number;
  periodEnd:        number;
}

function TrialCountdown({ trialEndsAt }: { trialEndsAt: string }) {
  const end   = new Date(trialEndsAt).getTime();
  const now   = Date.now();
  const days  = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));

  return (
    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-blue-500/20 bg-blue-500/5 text-sm">
      <Clock className="h-4 w-4 text-blue-400 shrink-0" />
      <span className="text-blue-300">
        Tu prueba gratuita termina en{" "}
        <strong>{days} {days === 1 ? "día" : "días"}</strong>.
        Añade un método de pago para no perder el acceso.
      </span>
    </div>
  );
}

function GracePeriodBanner({ gracePeriodEndsAt }: { gracePeriodEndsAt: string }) {
  const end  = new Date(gracePeriodEndsAt).getTime();
  const days = Math.max(0, Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24)));

  return (
    <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-red-500/20 bg-red-500/5">
      <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
      <div className="text-sm">
        <p className="text-red-300 font-medium">
          Suscripción cancelada — período de gracia activo
        </p>
        <p className="text-red-400/80 text-xs mt-0.5">
          Tienes acceso a tus funciones hasta en {days} {days === 1 ? "día" : "días"}.
          Reactiva tu plan antes del {new Date(gracePeriodEndsAt).toLocaleDateString("es")} para evitar la pérdida de datos.
        </p>
      </div>
    </div>
  );
}

function PastDueBanner() {
  return (
    <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
      <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
      <p className="text-sm text-amber-300">
        <strong>Pago fallido.</strong> Actualiza tu método de pago en el portal de facturación para
        evitar la interrupción del servicio.
      </p>
    </div>
  );
}

function InvoiceList({ workspaceId }: { workspaceId: string }) {
  const [invoices, setInvoices] = useState<StripeInvoice[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch(`/api/billing/invoices?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((d: { invoices?: StripeInvoice[] }) => setInvoices(d.invoices ?? []))
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!invoices.length) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        Sin facturas todavía. Aparecerán aquí después de tu primer pago.
      </p>
    );
  }

  const fmt = (cents: number, currency: string) =>
    new Intl.NumberFormat("es", { style: "currency", currency: currency.toUpperCase() })
      .format(cents / 100);

  const statusColor: Record<string, string> = {
    paid:           "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    open:           "text-amber-400 bg-amber-400/10 border-amber-400/20",
    void:           "text-muted-foreground bg-muted border-border",
    uncollectible:  "text-red-400 bg-red-400/10 border-red-400/20",
  };

  return (
    <div className="divide-y divide-border">
      {invoices.map((inv) => (
        <div key={inv.id} className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs font-medium text-foreground">
                {inv.number ?? inv.id}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {new Date(inv.created * 1000).toLocaleDateString("es", {
                  year: "numeric", month: "short", day: "numeric",
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-foreground">
              {fmt(inv.amountPaid || inv.amountDue, inv.currency)}
            </span>
            <Badge
              variant="outline"
              className={cn("text-[10px] h-4 px-1.5", statusColor[inv.status ?? "open"] ?? statusColor.open)}
            >
              {inv.status === "paid" ? "Pagada" : inv.status === "open" ? "Pendiente" : inv.status ?? "—"}
            </Badge>
            {inv.hostedInvoiceUrl && (
              <a
                href={inv.hostedInvoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Ver factura"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            {inv.invoicePdf && (
              <a
                href={inv.invoicePdf}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Descargar PDF"
              >
                <Download className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function BillingPageClient({ workspaceId, subscription, plans }: BillingPageClientProps) {
  const [interval, setInterval]         = useState<BillingInterval>("monthly");
  const [portalLoading, setPortalLoading] = useState(false);

  const statusInfo = STATUS_BADGE[subscription?.status ?? "trialing"] ?? STATUS_BADGE.trialing;

  const now                = Date.now();
  const isGracePeriodActive =
    subscription?.status === "canceled" &&
    subscription.gracePeriodEndsAt &&
    new Date(subscription.gracePeriodEndsAt).getTime() > now;

  const isTrialing =
    subscription?.status === "trialing" && !!subscription.trialEndsAt;

  const isPastDue = subscription?.status === "past_due" || subscription?.status === "unpaid";

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ workspaceId }),
      });
      const { url } = await res.json() as { url?: string };
      if (url) window.location.href = url;
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Facturación</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gestiona tu suscripción, plan y uso de recursos.
        </p>
      </div>

      {/* ── Status banners ── */}
      {isTrialing && subscription?.trialEndsAt && (
        <TrialCountdown trialEndsAt={subscription.trialEndsAt} />
      )}
      {isPastDue && <PastDueBanner />}
      {isGracePeriodActive && subscription?.gracePeriodEndsAt && (
        <GracePeriodBanner gracePeriodEndsAt={subscription.gracePeriodEndsAt} />
      )}

      {/* ── Current subscription ── */}
      {subscription && (
        <div className="flex items-center justify-between p-5 rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-4">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: "color-mix(in srgb, var(--brand) 10%, transparent)",
                border:          "1px solid color-mix(in srgb, var(--brand) 20%, transparent)",
              }}
            >
              <CreditCard className="h-5 w-5" style={{ color: "var(--brand)" }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {subscription.plan.name}
                  {subscription.billingInterval === "yearly" && (
                    <span className="ml-1 text-[10px] text-muted-foreground font-normal">(anual)</span>
                  )}
                </p>
                <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5", statusInfo.color)}>
                  {statusInfo.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {subscription.trialEndsAt
                  ? `Prueba gratuita hasta ${new Date(subscription.trialEndsAt).toLocaleDateString("es")}`
                  : subscription.currentPeriodEnd && subscription.status === "active"
                  ? `Próxima factura: ${new Date(subscription.currentPeriodEnd).toLocaleDateString("es")}`
                  : subscription.status === "canceled"
                  ? "Suscripción cancelada"
                  : "Sin suscripción activa"}
              </p>
            </div>
          </div>
          {subscription.stripeCustomerId && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePortal}
              disabled={portalLoading}
            >
              {portalLoading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <ExternalLink className="h-3.5 w-3.5 mr-1.5" />}
              Portal de facturación
            </Button>
          )}
        </div>
      )}

      {/* ── Usage meter ── */}
      <div className="p-5 rounded-2xl border border-border bg-card">
        <UsageMeter workspaceId={workspaceId} />
      </div>

      {/* ── Plan selector ── */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-semibold text-foreground">Planes disponibles</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cambia de plan en cualquier momento. Los cambios son inmediatos.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-lg border border-border bg-muted">
            <button
              onClick={() => setInterval("monthly")}
              className={cn(
                "px-3 py-1 text-xs rounded-md transition-colors",
                interval === "monthly"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Mensual
            </button>
            <button
              onClick={() => setInterval("yearly")}
              className={cn(
                "px-3 py-1 text-xs rounded-md transition-colors flex items-center gap-1",
                interval === "yearly"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Anual
              <span className="text-[9px] text-emerald-400 font-medium">-20%</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {plans.filter((p) => p.isActive).map((plan, i) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <PlanCard
                plan={plan}
                currentPlanId={subscription?.planId ?? "starter"}
                interval={interval}
                workspaceId={workspaceId}
              />
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Invoice history ── */}
      {subscription?.stripeCustomerId && (
        <div className="p-5 rounded-2xl border border-border bg-card">
          <h2 className="text-sm font-semibold text-foreground mb-4">Historial de facturas</h2>
          <InvoiceList workspaceId={workspaceId} />
        </div>
      )}

      {/* ── Security note ── */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Shield className="h-3.5 w-3.5" style={{ color: "var(--brand)" }} />
        Pagos seguros procesados por Stripe. Cancela en cualquier momento.
      </div>
    </div>
  );
}
