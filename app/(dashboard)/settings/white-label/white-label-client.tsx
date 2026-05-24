"use client";

import { useState, useCallback } from "react";
import {
  Palette, Globe, Mail, Building2, Lock, Loader2,
  ExternalLink, CheckCircle2, AlertTriangle, Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ImageUploader } from "@/components/ui/image-uploader";
import { cn } from "@/lib/utils";
import type { Workspace } from "@/types/workspace";
import type { Plan } from "@/types/billing";

// ─── Preset brand colours ─────────────────────────────────────────────────────

const PRESET_COLORS = [
  { hex: "#10b981", label: "Esmeralda (por defecto)" },
  { hex: "#3b82f6", label: "Azul" },
  { hex: "#8b5cf6", label: "Violeta" },
  { hex: "#f59e0b", label: "Ámbar" },
  { hex: "#ef4444", label: "Rojo" },
  { hex: "#ec4899", label: "Rosa" },
  { hex: "#06b6d4", label: "Cian" },
  { hex: "#f97316", label: "Naranja" },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface WhiteLabelClientProps {
  workspace: Workspace;
  plan:      Plan;
  allowed:   boolean;
}

// ─── Branding preview ─────────────────────────────────────────────────────────

function BrandingPreview({
  logoUrl,
  primaryColor,
  companyName,
}: {
  logoUrl:      string | null;
  primaryColor: string;
  companyName:  string | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-[#0a0a0f] overflow-hidden shadow-lg">
      {/* Fake sidebar */}
      <div className="flex h-52">
        <div
          className="w-14 flex flex-col items-center py-3 gap-3 border-r"
          style={{ borderColor: `${primaryColor}20`, background: "#0a0a0f" }}
        >
          {/* Logo mark */}
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold overflow-hidden"
            style={{ background: primaryColor }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="logo" className="w-full h-full object-contain" />
            ) : (
              (companyName?.[0] ?? "F").toUpperCase()
            )}
          </div>
          {/* Nav dots */}
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="w-6 h-6 rounded-md"
              style={{
                background: i === 0 ? `${primaryColor}30` : "#ffffff08",
                border: i === 0 ? `1px solid ${primaryColor}40` : "none",
              }}
            />
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-white/80">
              {companyName ?? "FlowAI CRM"}
            </p>
            <div
              className="h-5 px-2 rounded-md text-[9px] font-medium flex items-center"
              style={{ background: `${primaryColor}20`, color: primaryColor }}
            >
              Pro
            </div>
          </div>

          {/* Fake cards */}
          <div className="grid grid-cols-3 gap-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-lg bg-white/[0.04] border border-white/[0.06] p-2 space-y-1.5">
                <div className="h-1.5 w-8 rounded-full bg-white/20" />
                <div
                  className="h-3 w-6 rounded text-[8px] font-bold flex items-center justify-center"
                  style={{ color: primaryColor }}
                >
                  {(i + 1) * 12}
                </div>
              </div>
            ))}
          </div>

          {/* Fake button */}
          <div
            className="h-6 w-20 rounded-md text-[9px] font-semibold flex items-center justify-center mt-1"
            style={{ background: primaryColor, color: "#030712" }}
          >
            Acción
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Locked overlay for non-agency plans ──────────────────────────────────────

function PlanGateLock({ planName }: { planName: string }) {
  return (
    <div className="relative">
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm rounded-xl">
        <div className="h-10 w-10 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
          <Lock className="h-5 w-5 text-amber-400" />
        </div>
        <div className="text-center max-w-[240px]">
          <p className="text-sm font-semibold text-foreground mb-0.5">Función exclusiva</p>
          <p className="text-xs text-muted-foreground">
            La personalización white-label está incluida en los planes <strong>Agency</strong> y <strong>Enterprise</strong>.
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Tu plan actual: <span className="font-medium">{planName}</span>
          </p>
        </div>
        <Button
          size="sm"
          className="bg-[#10b981] hover:bg-[#0ea572] text-[#030712] text-xs h-7 mt-1"
          onClick={() => (window.location.href = "/settings/billing")}
        >
          <Sparkles className="h-3 w-3 mr-1.5" />
          Actualizar plan
        </Button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WhiteLabelClient({ workspace, plan, allowed }: WhiteLabelClientProps) {
  // Controlled state
  const [logoUrl,      setLogoUrl]      = useState<string | null>(workspace.logoUrl);
  const [logoPath,     setLogoPath]     = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState(workspace.primaryColor);
  const [companyName,  setCompanyName]  = useState(workspace.companyName ?? "");
  const [customDomain, setCustomDomain] = useState(workspace.customDomain ?? "");
  const [supportEmail, setSupportEmail] = useState(workspace.supportEmail ?? "");
  const [customColor,  setCustomColor]  = useState(workspace.primaryColor);

  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [saveErr,  setSaveErr]  = useState<string | null>(null);

  const handleLogoUpload = useCallback((url: string) => {
    setLogoUrl(url);
    setSaved(false);
  }, []);

  const handleLogoRemove = useCallback(() => {
    setLogoUrl(null);
    setLogoPath(null);
    setSaved(false);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveErr(null);
    try {
      const res = await fetch("/api/workspace", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId:  workspace.id,
          name:         workspace.name,
          logoUrl:      logoUrl ?? null,
          primaryColor: primaryColor,
          companyName:  companyName || null,
          supportEmail: supportEmail || null,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Error al guardar");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* ── Header ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-xl font-bold text-foreground">White Label</h1>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] h-5 px-2",
              allowed
                ? "text-[#10b981] border-[#10b981]/30 bg-[#10b981]/10"
                : "text-amber-400 border-amber-400/30 bg-amber-400/10"
            )}
          >
            {allowed ? plan.name : `Requiere Agency+`}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Personaliza la identidad visual de tu workspace: logotipo, colores y dominio.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* ── Left: controls ── */}
        <div className={cn("lg:col-span-3 space-y-8 relative", !allowed && "pointer-events-none")}>

          {/* Plan gate overlay */}
          {!allowed && <PlanGateLock planName={plan.name} />}

          {/* Logo upload */}
          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Logotipo</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Aparece en la barra lateral y correos. Máximo 8 MB — se convierte a WebP automáticamente.
              </p>
            </div>

            <div className="flex gap-6 items-start">
              <ImageUploader
                workspaceId={workspace.id}
                category="logo"
                currentUrl={logoUrl}
                label="Logo cuadrado"
                hint="512×512 px recomendado"
                autoApply={false}
                shape="square"
                maxPreviewSizePx={100}
                onUpload={handleLogoUpload}
                onRemove={handleLogoRemove}
                disabled={!allowed}
              />
              <ImageUploader
                workspaceId={workspace.id}
                category="banner"
                currentUrl={null}
                label="Banner horizontal (opcional)"
                hint="1200×400 px recomendado"
                autoApply={false}
                shape="wide"
                onUpload={() => {}}
                disabled={!allowed}
                className="flex-1"
              />
            </div>
          </section>

          <Separator />

          {/* Brand colour */}
          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Color principal</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Usado en botones, indicadores activos y acentos del sistema.
              </p>
            </div>

            {/* Preset swatches */}
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map(({ hex, label }) => (
                <button
                  key={hex}
                  title={label}
                  onClick={() => { setPrimaryColor(hex); setCustomColor(hex); }}
                  disabled={!allowed}
                  className={cn(
                    "w-8 h-8 rounded-full ring-2 ring-offset-2 ring-offset-background transition-all",
                    primaryColor === hex ? "ring-foreground scale-110" : "ring-transparent hover:scale-105"
                  )}
                  style={{ backgroundColor: hex }}
                  aria-pressed={primaryColor === hex}
                  aria-label={label}
                />
              ))}
            </div>

            {/* Custom colour picker */}
            <div className="flex items-center gap-3">
              <label className="relative cursor-pointer">
                <div
                  className="w-9 h-9 rounded-lg border border-border shadow-sm"
                  style={{ backgroundColor: customColor }}
                />
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => { setCustomColor(e.target.value); setPrimaryColor(e.target.value); }}
                  disabled={!allowed}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  aria-label="Custom color picker"
                />
              </label>
              <div className="space-y-0.5">
                <Input
                  value={customColor}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCustomColor(v);
                    if (/^#[0-9a-fA-F]{6}$/.test(v)) setPrimaryColor(v);
                  }}
                  disabled={!allowed}
                  className="h-8 w-32 text-xs font-mono"
                  placeholder="#10b981"
                  maxLength={7}
                />
                <p className="text-[10px] text-muted-foreground">Hex personalizado</p>
              </div>
            </div>
          </section>

          <Separator />

          {/* Company info */}
          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Información de empresa</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Visible en los correos enviados a los usuarios y en la cabecera.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Nombre de empresa
                </Label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={!allowed}
                  className="h-8 text-sm"
                  placeholder="Acme Inc."
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  Email de soporte
                </Label>
                <Input
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  disabled={!allowed}
                  className="h-8 text-sm"
                  placeholder="soporte@empresa.com"
                />
              </div>
            </div>
          </section>

          <Separator />

          {/* Custom domain */}
          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Dominio personalizado</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Accede al CRM desde tu propio dominio. Requiere agregar un registro CNAME en tu DNS.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                Dominio
              </Label>
              <div className="flex gap-2">
                <Input
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  disabled={!allowed}
                  className="h-8 text-sm"
                  placeholder="crm.tu-empresa.com"
                />
                {customDomain && allowed && (
                  <Button variant="outline" size="sm" className="h-8 shrink-0 text-xs gap-1.5" asChild>
                    <a href={`https://${customDomain}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Verificar
                    </a>
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Agrega un CNAME: <code className="font-mono text-foreground">crm.tu-empresa.com → app.flowai.io</code>
              </p>
            </div>
          </section>

          {/* ── Save row ── */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleSave}
              disabled={saving || !allowed}
              className="bg-[#10b981] hover:bg-[#0ea572] text-[#030712] h-8 text-xs"
              size="sm"
            >
              {saving ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Guardando…</>
              ) : (
                "Guardar cambios"
              )}
            </Button>

            <AnimatePresence>
              {saved && (
                <motion.div
                  key="saved"
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1.5 text-[#10b981] text-xs"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Cambios guardados
                </motion.div>
              )}
              {saveErr && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-1.5 text-red-400 text-xs"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {saveErr}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Right: live preview ── */}
        <div className="lg:col-span-2 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Vista previa en tiempo real
          </p>
          <BrandingPreview
            logoUrl={logoUrl}
            primaryColor={primaryColor}
            companyName={companyName || null}
          />
          <p className="text-[10px] text-muted-foreground text-center">
            Así verán los agentes la interfaz con tu marca
          </p>

          {/* Color swatch preview */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-3">
            <p className="text-xs font-medium text-foreground">Paleta generada</p>
            <div className="grid grid-cols-5 gap-1.5">
              {[0.1, 0.2, 0.4, 0.7, 1].map((opacity) => (
                <div
                  key={opacity}
                  className="h-8 rounded-md"
                  style={{ background: `${primaryColor}${Math.round(opacity * 255).toString(16).padStart(2, "0")}` }}
                  title={`${Math.round(opacity * 100)}% opacidad`}
                />
              ))}
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>10%</span>
              <span>100%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
