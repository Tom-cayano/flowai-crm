import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAllChannels } from "@/lib/actions/channels";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Smartphone,
  MessageSquare,
  Settings,
  Plus,
  Clock,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Canales — FlowAI CRM" };

// ─── Icons ────────────────────────────────────────────────────────────────────

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="2" width="20" height="20" rx="6" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MessengerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.31.27.51l.05 1.6c.04.51.57.82 1.04.6l1.79-.78c.15-.07.32-.08.48-.03.79.22 1.63.33 2.5.33 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm5.98 7.28l-2.93 4.65c-.47.73-1.47.92-2.17.4l-2.33-1.75c-.21-.16-.51-.16-.72 0l-3.14 2.38c-.42.32-.96-.17-.68-.62l2.93-4.65c.47-.73 1.47-.92 2.17-.4l2.33 1.75c.21.16.51.16.72 0l3.14-2.38c.42-.32.96.17.68.62z" />
    </svg>
  );
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function StateIcon({ state }: { state: string }) {
  if (state === "connected") {
    return <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />;
  }
  if (state === "token_expired" || state === "error") {
    return <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />;
  }
  return <XCircle className="h-4 w-4 text-red-400 shrink-0" />;
}

function StateBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; className: string }> = {
    connected:     { label: "Conectado",     className: "text-emerald-400 border-emerald-400/40" },
    disconnected:  { label: "Desconectado",  className: "text-red-400 border-red-400/40" },
    token_expired: { label: "Token expirado",className: "text-amber-400 border-amber-400/40" },
    error:         { label: "Error",         className: "text-red-400 border-red-400/40" },
    qr_code:       { label: "Escaneando QR", className: "text-blue-400 border-blue-400/40" },
    unknown:       { label: "Desconocido",   className: "text-muted-foreground border-border" },
  };
  const { label, className } = map[state] ?? map.unknown;
  return (
    <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5", className)}>
      {label}
    </Badge>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  description,
  addHref,
  addLabel,
  children,
  empty,
}: {
  icon:        React.ReactNode;
  title:       string;
  description: string;
  addHref:     string;
  addLabel:    string;
  children?:   React.ReactNode;
  empty?:      React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            {icon}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-[11px] text-muted-foreground">{description}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" asChild>
          <Link href={addHref}>
            <Plus className="h-3 w-3" />
            {addLabel}
          </Link>
        </Button>
      </div>
      {children ?? empty}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ChannelsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const result = await getAllChannels();
  if (!result.data) redirect("/onboarding");

  const { whatsappEvolution, whatsappCloud, instagram, messenger } = result.data;

  const totalConnected =
    whatsappEvolution.filter((a) => a.status === "connected").length +
    whatsappCloud.filter((a) => a.connectionState === "connected").length +
    instagram.filter((a) => a.connectionState === "connected").length +
    messenger.filter((a) => a.isActive).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-base font-semibold text-foreground">Canales</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalConnected} canal{totalConnected !== 1 ? "es" : ""} activo{totalConnected !== 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" asChild>
          <Link href="/settings/meta">
            <Settings className="h-3 w-3" />
            Configurar Meta App
          </Link>
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-2xl space-y-8">

          {/* ── WhatsApp via Evolution API ───────────────────────────────── */}
          <Section
            icon={<WhatsAppIcon className="h-4 w-4" />}
            title="WhatsApp (Evolution API)"
            description="Conexión vía proxy Evolution — múltiples instancias"
            addHref="/whatsapp"
            addLabel="Gestionar instancias"
          >
            {whatsappEvolution.length > 0 ? (
              <div className="space-y-2">
                {whatsappEvolution.map((acc) => (
                  <div
                    key={acc.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
                  >
                    <StateIcon state={acc.status === "open" ? "connected" : acc.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {acc.instanceName}
                      </p>
                      {acc.phoneNumber && (
                        <p className="text-[11px] text-muted-foreground">{acc.phoneNumber}</p>
                      )}
                    </div>
                    <StateBadge state={acc.status === "open" ? "connected" : acc.status} />
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" asChild>
                      <Link href="/whatsapp">
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-3">
                Sin instancias. <Link href="/whatsapp" className="text-[color:var(--brand)] hover:underline">Conectar →</Link>
              </p>
            )}
          </Section>

          {/* ── WhatsApp Cloud API ───────────────────────────────────────── */}
          <Section
            icon={<WhatsAppIcon className="h-4 w-4" />}
            title="WhatsApp Cloud API"
            description="Conexión directa con la API oficial de Meta"
            addHref="/settings/meta"
            addLabel="Conectar número"
          >
            {whatsappCloud.length > 0 ? (
              <div className="space-y-2">
                {whatsappCloud.map((acc) => (
                  <div
                    key={acc.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
                  >
                    <StateIcon state={acc.connectionState} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {acc.verifiedName ?? acc.displayPhoneNumber ?? acc.phoneNumberId}
                      </p>
                      {acc.displayPhoneNumber && (
                        <p className="text-[11px] text-muted-foreground">{acc.displayPhoneNumber}</p>
                      )}
                      {acc.lastError && (
                        <p className="text-[10px] text-red-400 truncate mt-0.5">{acc.lastError}</p>
                      )}
                    </div>
                    <StateBadge state={acc.connectionState} />
                    {acc.lastSyncedAt && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                        <Clock className="h-3 w-3" />
                        {new Date(acc.lastSyncedAt).toLocaleDateString("es")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-3">
                Sin números conectados. <Link href="/settings/meta" className="text-[color:var(--brand)] hover:underline">Configurar →</Link>
              </p>
            )}
          </Section>

          {/* ── Instagram ────────────────────────────────────────────────── */}
          <Section
            icon={<InstagramIcon className="h-4 w-4" />}
            title="Instagram DM"
            description="Mensajes directos de Instagram Business"
            addHref="/settings/instagram"
            addLabel="Conectar cuenta"
          >
            {instagram.length > 0 ? (
              <div className="space-y-2">
                {instagram.map((acc) => {
                  const expiresAt = acc.tokenExpiresAt ? new Date(acc.tokenExpiresAt) : null;
                  const daysLeft  = expiresAt
                    ? Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000)
                    : null;

                  return (
                    <div
                      key={acc.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
                    >
                      <StateIcon state={acc.connectionState} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">@{acc.igUsername}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {acc.followersCount.toLocaleString("es")} seguidores
                        </p>
                        {acc.lastError && (
                          <p className="text-[10px] text-red-400 truncate mt-0.5">{acc.lastError}</p>
                        )}
                      </div>
                      <StateBadge state={acc.connectionState} />
                      {daysLeft !== null && daysLeft <= 10 && (
                        <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-400/40 shrink-0">
                          Expira en {daysLeft}d
                        </Badge>
                      )}
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" asChild>
                        <Link href="/settings/instagram">
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-3">
                Sin cuentas conectadas. <Link href="/settings/instagram" className="text-[color:var(--brand)] hover:underline">Conectar →</Link>
              </p>
            )}
          </Section>

          {/* ── Facebook Messenger ───────────────────────────────────────── */}
          <Section
            icon={<MessengerIcon className="h-4 w-4" />}
            title="Facebook Messenger"
            description="Mensajes de tu página de Facebook"
            addHref="/settings/meta"
            addLabel="Conectar página"
          >
            {messenger.length > 0 ? (
              <div className="space-y-2">
                {messenger.map((page) => (
                  <div
                    key={page.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
                  >
                    <StateIcon state={page.isActive ? "connected" : "disconnected"} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {page.pageName ?? page.pageId}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        ID: {page.pageId}
                      </p>
                    </div>
                    <StateBadge state={page.isActive ? "connected" : "disconnected"} />
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                      <Clock className="h-3 w-3" />
                      {new Date(page.connectedAt).toLocaleDateString("es")}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-3">
                Sin páginas conectadas. <Link href="/settings/meta" className="text-[color:var(--brand)] hover:underline">Configurar →</Link>
              </p>
            )}
          </Section>

          {/* ── TikTok ── future ─────────────────────────────────────────── */}
          <Section
            icon={
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.16 8.16 0 004.77 1.52V6.76a4.85 4.85 0 01-1-.07z" />
              </svg>
            }
            title="TikTok Business Messaging"
            description="Próximamente — requiere acceso de partner oficial"
            addHref="#"
            addLabel="Lista de espera"
          >
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border/60 bg-muted/40">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <p className="text-xs text-muted-foreground">
                TikTok Business Messaging está disponible solo para partners oficiales.
                Estamos en proceso de certificación.
              </p>
            </div>
          </Section>

        </div>
      </div>
    </div>
  );
}
