import { redirect } from "next/navigation";
import Link from "next/link";
import {
  MessageSquare, AlertCircle, ExternalLink, Plus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function MessengerIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <linearGradient id="msg-grad-settings" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#0099ff" />
          <stop offset="100%" stopColor="#a033ff" />
        </linearGradient>
      </defs>
      <path
        d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.31.27.51l.05 1.6c.04.51.57.82 1.04.6l1.79-.78c.15-.07.32-.08.48-.03.79.22 1.63.33 2.5.33 5.64 0 10-4.13 10-9.7S17.64 2 12 2z"
        fill="url(#msg-grad-settings)"
      />
      <path
        d="M17.98 9.28l-2.93 4.65c-.47.73-1.47.92-2.17.4l-2.33-1.75c-.21-.16-.51-.16-.72 0l-3.14 2.38c-.42.32-.96-.17-.68-.62l2.93-4.65c.47-.73 1.47-.92 2.17-.4l2.33 1.75c.21.16.51.16.72 0l3.14-2.38c.42-.32.96.17.68.62z"
        fill="white"
      />
    </svg>
  );
}

export default async function MessengerIntegrationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspaceId = await getUserPrimaryWorkspace(user.id);
  if (!workspaceId) redirect("/onboarding");

  const db = createAdminClient();
  const { data: pages } = await db
    .from("facebook_pages")
    .select("id, page_id, page_name, is_active, connected_at")
    .eq("workspace_id", workspaceId)
    .order("connected_at", { ascending: false });

  const active = (pages ?? []).filter((p) => p.is_active);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <MessengerIcon size={18} />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">Facebook Messenger</h1>
            <p className="text-xs text-muted-foreground">
              {active.length} página{active.length !== 1 ? "s" : ""} activa{active.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground" asChild>
          <a href="https://developers.facebook.com/docs/messenger-platform" target="_blank" rel="noreferrer">
            <ExternalLink className="h-3 w-3" />
            Docs
          </a>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl space-y-6">

          {/* How it works */}
          <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 space-y-1">
            <p className="text-xs font-medium text-foreground">¿Cómo funciona?</p>
            <p className="text-xs text-muted-foreground">
              Messenger se conecta automáticamente al vincular tu cuenta de Instagram Business.
              El flujo OAuth de Instagram obtiene acceso a las páginas de Facebook asociadas y
              las suscribe al webhook de Messenger en un solo paso.
            </p>
          </div>

          {/* Pages list */}
          {(pages ?? []).length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Páginas conectadas</p>
              {(pages ?? []).map((page) => (
                <div key={page.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                  <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                    <MessageSquare className="h-4 w-4 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {page.page_name ?? page.page_id}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">ID: {page.page_id}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Conectada {new Date(page.connected_at).toLocaleDateString("es")}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] shrink-0",
                      page.is_active
                        ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30"
                        : "text-muted-foreground bg-muted border-border"
                    )}
                  >
                    {page.is_active ? "Activa" : "Inactiva"}
                  </Badge>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground" asChild>
                    <Link href="/messenger" title="Abrir bandeja">
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              ))}

              {active.some((p) => !p.is_active) && (
                <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-md px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  Algunas páginas tienen problemas de conexión. Reconecta mediante Instagram.
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mx-auto">
                <MessengerIcon size={24} />
              </div>
              <p className="text-sm font-medium">Sin páginas conectadas</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Conecta tu cuenta de Instagram Business para vincular las páginas de Facebook automáticamente.
              </p>
            </div>
          )}

          {/* Connect via Instagram */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {(pages ?? []).length > 0 ? "Agregar más páginas" : "Conectar"}
            </p>
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-purple-500 to-orange-400 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-bold text-white">IG</span>
                </div>
                <p className="text-xs font-medium text-foreground">Conectar mediante Instagram</p>
              </div>
              <p className="text-xs text-muted-foreground">
                El flujo OAuth de Instagram también conecta las páginas de Facebook asociadas y
                configura el webhook de Messenger en un solo paso.
              </p>
              <Button asChild size="sm" className="h-8 text-xs gap-1.5 shrink-0">
                <a href="/api/instagram/oauth/start" rel="noreferrer noopener">
                  <Plus className="h-3.5 w-3.5" />
                  Conectar cuenta
                </a>
              </Button>
            </div>
          </div>

          {/* Verification guide */}
          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Verificación</p>
            <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal list-inside">
              {[
                "Conecta Instagram Business — las páginas aparecen automáticamente.",
                "Envía un mensaje a tu página de Facebook desde cualquier cuenta.",
                "El mensaje debe aparecer en /messenger en menos de 5 segundos.",
                "Si no aparece, verifica META_APP_SECRET y META_WEBHOOK_VERIFY_TOKEN.",
                'Revisa /api/ops/health para estado del worker y la cola "fbm:message".',
              ].map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          </div>

        </div>
      </div>
    </div>
  );
}
