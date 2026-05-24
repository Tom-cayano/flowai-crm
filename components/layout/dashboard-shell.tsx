"use client";

import { useState, useEffect, useId } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, AlertTriangle, Clock } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { DynamicFavicon } from "./dynamic-favicon";
import type { SessionUser, WorkspaceBranding, WorkspaceBillingStatus } from "@/types";

// Only allow valid 3/6/8-digit hex colors to prevent CSS injection.
function safeCssColor(color: string | null | undefined): string | null {
  if (!color) return null;
  return /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?$/.test(color)
    ? color
    : null;
}

interface DashboardShellProps {
  children:  React.ReactNode;
  user:      SessionUser;
  workspace: WorkspaceBranding | null;
  billing:   WorkspaceBillingStatus | null;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  return Math.ceil(ms / 86_400_000);
}

function BillingBanner({ billing, onUpgrade }: { billing: WorkspaceBillingStatus; onUpgrade: () => void }) {
  const { status, trialEndsAt, gracePeriodEndsAt } = billing;

  if (status === "trialing") {
    const days = daysUntil(trialEndsAt);
    if (days !== null && days <= 7) {
      return (
        <div className="flex items-center gap-2 px-4 py-2 text-[13px] bg-amber-500/10 border-b border-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>Tu período de prueba vence en <strong>{days} {days === 1 ? "día" : "días"}</strong>.</span>
          <button onClick={onUpgrade} className="ml-auto underline underline-offset-2 font-medium whitespace-nowrap hover:opacity-80">Actualizar plan</button>
        </div>
      );
    }
  }

  if (status === "past_due" || status === "unpaid") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 text-[13px] bg-red-500/10 border-b border-red-500/20 text-red-600 dark:text-red-400 shrink-0">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>Hay un problema con tu pago. Actualiza tu método de pago para evitar interrupciones.</span>
        <button onClick={onUpgrade} className="ml-auto underline underline-offset-2 font-medium whitespace-nowrap hover:opacity-80">Ir a facturación</button>
      </div>
    );
  }

  if (status === "canceled") {
    const days = daysUntil(gracePeriodEndsAt);
    if (days !== null) {
      return (
        <div className="flex items-center gap-2 px-4 py-2 text-[13px] bg-amber-500/10 border-b border-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Tu suscripción fue cancelada. Acceso hasta dentro de <strong>{days} {days === 1 ? "día" : "días"}</strong>.</span>
          <button onClick={onUpgrade} className="ml-auto underline underline-offset-2 font-medium whitespace-nowrap hover:opacity-80">Reactivar plan</button>
        </div>
      );
    }
  }

  return null;
}

export function DashboardShell({ children, user, workspace, billing }: DashboardShellProps) {
  const [collapsed, setCollapsed]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router   = useRouter();
  const styleId  = useId();

  // Close mobile drawer on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Build CSS variable override when workspace has a non-default brand color.
  const brandColor = safeCssColor(workspace?.primaryColor);
  const isCustomBrand = brandColor && brandColor !== "#10b981";
  const brandCss = isCustomBrand
    ? `.dark { --brand: ${brandColor}; --primary: ${brandColor}; --ring: ${brandColor}; --sidebar-accent-foreground: ${brandColor}; }`
    : null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── White-label theme + favicon injection ── */}
      <DynamicFavicon logoUrl={workspace?.logoUrl ?? null} />
      {brandCss && (
        <style id={styleId} dangerouslySetInnerHTML={{ __html: brandCss }} />
      )}

      {/* ── Desktop sidebar (hidden on mobile) ── */}
      <div className="hidden md:flex flex-col h-full shrink-0">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          user={user}
          workspace={workspace}
        />
      </div>

      {/* ── Mobile: overlay drawer ── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              className="fixed inset-y-0 left-0 z-50 md:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            >
              <Sidebar
                collapsed={false}
                onToggle={() => setMobileOpen(false)}
                user={user}
                workspace={workspace}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Main content ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <div className="md:hidden flex items-center h-14 px-4 border-b border-border bg-card shrink-0 gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-[13px] font-semibold text-foreground">
            {workspace?.companyName ?? workspace?.name ?? "FlowAI CRM"}
          </span>
        </div>

        {/* Desktop topbar */}
        <div className="hidden md:block">
          <Topbar user={user} workspace={workspace} />
        </div>

        {/* Billing status banners */}
        {billing && (
          <BillingBanner
            billing={billing}
            onUpgrade={() => router.push("/settings/billing")}
          />
        )}

        <main className="flex-1 overflow-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
