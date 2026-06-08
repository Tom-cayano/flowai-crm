"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Copy,
  Check,
  ExternalLink,
  Webhook,
  Key,
  Shield,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={handleCopy}
      className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon:        React.ReactNode;
  title:       string;
  description: string;
  children:    React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-3 pl-10">
        {children}
      </div>
    </div>
  );
}

// ─── Step ─────────────────────────────────────────────────────────────────────

function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center gap-1 shrink-0">
        <div className="h-5 w-5 rounded-full bg-[color:var(--brand)]/10 border border-[color:var(--brand)]/30 flex items-center justify-center text-[10px] font-bold text-[color:var(--brand)]">
          {n}
        </div>
        <div className="flex-1 w-px bg-border min-h-[8px]" />
      </div>
      <div className="pb-4 min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground mb-2">{label}</p>
        {children}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MetaSettingsPage() {
  const appUrl = typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL ?? "https://your-domain.com";

  const webhookUrl      = `${appUrl}/api/webhook/meta`;
  const igWebhookUrl    = `${appUrl}/api/webhook/instagram`;
  const fbWebhookUrl    = `${appUrl}/api/webhook/facebook`;
  const waWebhookUrl    = `${appUrl}/api/webhook/whatsapp`;

  const envVars = [
    { key: "META_APP_ID",                  desc: "ID de la Meta App (de Meta for Developers)" },
    { key: "META_APP_SECRET",              desc: "App Secret (Configuración básica → App Secret)" },
    { key: "META_WEBHOOK_VERIFY_TOKEN",    desc: "Token de verificación del webhook (elige uno seguro)" },
    { key: "INSTAGRAM_APP_ID",             desc: "ID de la app para Instagram (puede ser el mismo Meta App ID)" },
    { key: "INSTAGRAM_APP_SECRET",         desc: "App Secret para Instagram (si usas app separada)" },
    { key: "INSTAGRAM_WEBHOOK_VERIFY_TOKEN", desc: "Verify token para el webhook de Instagram" },
    { key: "INSTAGRAM_TOKEN_ENCRYPTION_KEY", desc: "Clave AES-256 para encriptar tokens (32 bytes hex). Genera: openssl rand -hex 32" },
    { key: "FACEBOOK_VERIFY_TOKEN",        desc: "Verify token para el webhook de Messenger" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-base font-semibold">Meta App</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configuración de la integración con Meta Business Platform
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" asChild>
          <Link href="/settings/channels">
            <ChevronRight className="h-3 w-3 rotate-180" />
            Canales
          </Link>
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-2xl space-y-10">

          {/* Alert */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-400">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p className="text-xs">
              Configura estas variables en tu archivo <code className="font-mono">.env.local</code> y en el panel de Vercel.
              Nunca las expongas al cliente (sin prefijo <code className="font-mono">NEXT_PUBLIC_</code>).
            </p>
          </div>

          {/* ── Variables de entorno ───────────────────────────────────── */}
          <Section
            icon={<Key className="h-4 w-4" />}
            title="Variables de entorno"
            description="Configura estas en .env.local y en Vercel → Settings → Environment Variables"
          >
            <div className="space-y-2.5">
              {envVars.map(({ key, desc }) => (
                <div key={key} className="space-y-1">
                  <div className="relative">
                    <Input
                      readOnly
                      value={key}
                      className="h-7 text-xs font-mono pr-8 bg-muted border-border"
                    />
                    <CopyButton value={key} />
                  </div>
                  <p className="text-[10px] text-muted-foreground pl-1">{desc}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Webhook URLs ───────────────────────────────────────────── */}
          <Section
            icon={<Webhook className="h-4 w-4" />}
            title="URLs de Webhook"
            description="Configura estas URLs en tu Meta App → Webhooks"
          >
            <div className="space-y-3">
              {[
                { label: "Unified (WA Cloud + IG + Messenger)", url: webhookUrl,   badge: "Recomendado" },
                { label: "WhatsApp Cloud API",                   url: waWebhookUrl, badge: "Evolution API" },
                { label: "Instagram",                            url: igWebhookUrl, badge: null },
                { label: "Messenger",                            url: fbWebhookUrl, badge: null },
              ].map(({ label, url, badge }) => (
                <div key={url} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    {badge && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1 text-[color:var(--brand)] border-[color:var(--brand)]/30">
                        {badge}
                      </Badge>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      readOnly
                      value={url}
                      className="h-7 text-[11px] font-mono pr-8 bg-muted border-border"
                    />
                    <CopyButton value={url} />
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Pasos WhatsApp Cloud API ───────────────────────────────── */}
          <Section
            icon={
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            }
            title="Conectar WhatsApp Cloud API"
            description="Pasos para conectar un número directamente con la API oficial de Meta"
          >
            <Step n={1} label="Crear Meta App en Meta for Developers">
              <p className="text-xs text-muted-foreground">
                Ve a{" "}
                <a
                  href="https://developers.facebook.com/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[color:var(--brand)] hover:underline inline-flex items-center gap-0.5"
                >
                  developers.facebook.com/apps <ExternalLink className="h-3 w-3" />
                </a>{" "}
                → Crear app → Tipo: <strong>Business</strong>.
              </p>
            </Step>
            <Step n={2} label="Añadir producto WhatsApp">
              <p className="text-xs text-muted-foreground">
                Panel de la app → Añadir producto → WhatsApp → Configurar.
                Vincula tu <strong>WhatsApp Business Account (WABA)</strong>.
              </p>
            </Step>
            <Step n={3} label="Crear usuario del sistema">
              <p className="text-xs text-muted-foreground">
                Meta Business Suite → Configuración → Usuarios del sistema → Añadir.
                Asigna rol <strong>Administrador</strong>. Genera un token de acceso con los permisos:
                <code className="ml-1 text-[10px] bg-muted rounded px-1">whatsapp_business_messaging</code>,{" "}
                <code className="text-[10px] bg-muted rounded px-1">whatsapp_business_management</code>.
              </p>
            </Step>
            <Step n={4} label="Configurar webhook">
              <p className="text-xs text-muted-foreground">
                WhatsApp → Configuración → Webhooks.
                URL de callback:
              </p>
              <div className="relative mt-1.5">
                <Input readOnly value={webhookUrl} className="h-7 text-[11px] font-mono pr-8 bg-muted" />
                <CopyButton value={webhookUrl} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Verify token: el valor de <code className="font-mono">META_WEBHOOK_VERIFY_TOKEN</code>.
                Suscríbete al campo <strong>messages</strong>.
              </p>
            </Step>
            <Step n={5} label="Registrar en FlowAI">
              <p className="text-xs text-muted-foreground">
                Ejecuta este SQL en Supabase con tu <code className="font-mono text-[10px]">phone_number_id</code>,
                <code className="font-mono text-[10px] ml-1">waba_id</code> y token encriptado:
              </p>
              <pre className="mt-1.5 text-[10px] bg-muted rounded-lg p-3 overflow-x-auto text-muted-foreground">
{`INSERT INTO whatsapp_cloud_accounts (
  workspace_id, user_id, waba_id,
  phone_number_id, display_phone_number,
  verified_name, access_token_enc
) VALUES (
  '<workspace_id>', '<user_id>', '<waba_id>',
  '<phone_number_id>', '+15559876543',
  'Mi Empresa', '<encrypted_token>'
);`}
              </pre>
              <p className="text-[10px] text-muted-foreground mt-1">
                Encripta el token con <code className="font-mono">encryptToken()</code> de{" "}
                <code className="font-mono">lib/instagram/token-store.ts</code>.
              </p>
            </Step>
          </Section>

          {/* ── Permisos necesarios ───────────────────────────────────── */}
          <Section
            icon={<Shield className="h-4 w-4" />}
            title="Permisos de Meta App"
            description="Permisos requeridos por canal en la Meta App Review"
          >
            <div className="space-y-3">
              {[
                {
                  channel: "WhatsApp Cloud API",
                  perms: ["whatsapp_business_messaging", "whatsapp_business_management"],
                },
                {
                  channel: "Instagram DM",
                  perms: ["instagram_business_basic", "instagram_business_manage_messages", "instagram_business_manage_comments", "pages_show_list", "pages_read_engagement", "pages_manage_metadata"],
                },
                {
                  channel: "Facebook Messenger",
                  perms: ["pages_messaging", "pages_manage_metadata", "pages_read_engagement"],
                },
              ].map(({ channel, perms }) => (
                <div key={channel} className="space-y-1.5">
                  <p className="text-[11px] font-medium text-foreground">{channel}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {perms.map((p) => (
                      <code key={p} className="text-[10px] bg-muted border border-border rounded px-1.5 py-0.5 text-muted-foreground">
                        {p}
                      </code>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Links útiles */}
          <div className="pt-2 border-t border-border space-y-2">
            <p className="text-xs font-medium text-foreground">Documentación</p>
            <div className="space-y-1.5">
              {[
                { label: "WhatsApp Cloud API — Guía de inicio",   href: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" },
                { label: "Instagram Messaging API",                href: "https://developers.facebook.com/docs/messenger-platform/instagram" },
                { label: "Messenger Platform",                     href: "https://developers.facebook.com/docs/messenger-platform" },
                { label: "Webhooks de Meta",                       href: "https://developers.facebook.com/docs/graph-api/webhooks" },
              ].map(({ label, href }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "flex items-center gap-1.5 text-xs text-muted-foreground",
                    "hover:text-[color:var(--brand)] transition-colors"
                  )}
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  {label}
                </a>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
