import { redirect } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2, XCircle, AlertCircle, ExternalLink,
  Phone, MessageSquare, Settings,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { validateEnv, getChannelCapabilities } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={cn(
      "inline-block h-2 w-2 rounded-full shrink-0",
      ok ? "bg-emerald-400" : "bg-red-400"
    )} />
  );
}

function EnvRow({ name, present }: { name: string; present: boolean }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <StatusDot ok={present} />
      <code className="text-xs font-mono text-foreground flex-1">{name}</code>
      <span className={cn("text-[10px] font-medium", present ? "text-emerald-400" : "text-red-400")}>
        {present ? "configurada" : "falta"}
      </span>
    </div>
  );
}

export default async function MetaIntegrationsHubPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspaceId = await getUserPrimaryWorkspace(user.id);
  if (!workspaceId) redirect("/onboarding");

  const db = createAdminClient();

  // Fetch counts for each channel
  const [wacResult, igResult, fbResult] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from("whatsapp_cloud_accounts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("is_active", true) as Promise<{ count: number | null }>,
    db
      .from("instagram_accounts")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("is_active", true),
    db
      .from("facebook_pages")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("is_active", true),
  ]);

  const wacCount = (wacResult as { count: number | null }).count ?? 0;
  const igCount  = igResult.count  ?? 0;
  const fbCount  = fbResult.count  ?? 0;

  const envReport    = validateEnv();
  const capabilities = getChannelCapabilities();

  const webhookUrl = process.env.NEXT_PUBLIC_BASE_URL
    ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhook/meta`
    : null;

  const channels = [
    {
      href:        "/settings/integrations/whatsapp",
      label:       "WhatsApp Cloud API",
      description: "Mensajes directos con la API oficial de Meta",
      icon:        <Phone className="h-4 w-4 text-[#25D366]" />,
      iconBg:      "bg-[#25D366]/10",
      ready:       capabilities.whatsappCloud,
      count:       wacCount,
      countLabel:  "número",
    },
    {
      href:        "/settings/integrations/messenger",
      label:       "Facebook Messenger",
      description: "Mensajes de tus páginas de Facebook",
      icon:        <MessageSquare className="h-4 w-4 text-blue-400" />,
      iconBg:      "bg-blue-500/10",
      ready:       capabilities.messenger,
      count:       fbCount,
      countLabel:  "página",
    },
    {
      href:        "/settings/instagram",
      label:       "Instagram Business",
      description: "DMs y comentarios de Instagram",
      icon:        (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="6" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      ),
      iconBg:      "bg-pink-500/10 [&>svg]:text-pink-400",
      ready:       capabilities.instagram,
      count:       igCount,
      countLabel:  "cuenta",
    },
  ];

  // Env vars to display
  const envVars = [
    { name: "META_APP_ID",               present: !!process.env.META_APP_ID },
    { name: "META_APP_SECRET",           present: !!process.env.META_APP_SECRET },
    { name: "META_WEBHOOK_VERIFY_TOKEN", present: !!process.env.META_WEBHOOK_VERIFY_TOKEN },
    { name: "INSTAGRAM_APP_ID",          present: !!(process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID) },
    { name: "INSTAGRAM_APP_SECRET",      present: !!(process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET) },
    { name: "INSTAGRAM_TOKEN_ENCRYPTION_KEY", present: !!process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY },
    { name: "NEXT_PUBLIC_BASE_URL",      present: !!process.env.NEXT_PUBLIC_BASE_URL },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-sm font-semibold text-foreground">Meta Integrations</h1>
          <p className="text-xs text-muted-foreground">
            WhatsApp · Messenger · Instagram
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground" asChild>
          <a href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">
            <ExternalLink className="h-3 w-3" />
            Meta Developers
          </a>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl space-y-6">

          {/* Env warnings */}
          {!envReport.ok && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <div className="text-xs text-red-300 space-y-1">
                <p className="font-medium">Variables requeridas faltantes</p>
                <p className="text-red-400/80 font-mono">{envReport.missing.join(", ")}</p>
              </div>
            </div>
          )}
          {envReport.warnings.length > 0 && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-300 space-y-1">
                <p className="font-medium">Funcionalidades degradadas</p>
                <p className="text-amber-400/80">
                  {envReport.warnings.length} variable{envReport.warnings.length !== 1 ? "s" : ""} opcionales sin configurar.
                  Algunas integraciones no estarán disponibles.
                </p>
              </div>
            </div>
          )}

          {/* Channel cards */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Canales</p>
            {channels.map((ch) => (
              <Link
                key={ch.href}
                href={ch.href}
                className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:bg-white/[0.03] transition-colors group"
              >
                <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", ch.iconBg)}>
                  {ch.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">{ch.label}</p>
                  <p className="text-[11px] text-muted-foreground">{ch.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {ch.count > 0 && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      {ch.count} {ch.countLabel}{ch.count !== 1 ? "s" : ""}
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className={cn("text-[10px]", ch.ready
                      ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30"
                      : "text-muted-foreground bg-muted border-border"
                    )}
                  >
                    {ch.ready ? "Listo" : "Pendiente"}
                  </Badge>
                  <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors" />
                </div>
              </Link>
            ))}
          </div>

          {/* Webhook URL */}
          {webhookUrl && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Webhook unificado</p>
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                <code className="text-xs font-mono text-foreground break-all">{webhookUrl}</code>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Apunta este URL en Meta Developers → tu App → Webhooks. Un solo endpoint recibe eventos de WhatsApp, Instagram y Messenger.
              </p>
            </div>
          )}

          {/* Env var status */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Variables de entorno</p>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground" asChild>
                <Link href="/settings/meta">
                  <Settings className="h-3 w-3" />
                  Guía
                </Link>
              </Button>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-1 divide-y divide-border">
              {envVars.map((v) => (
                <EnvRow key={v.name} name={v.name} present={v.present} />
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
