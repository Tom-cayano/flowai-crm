"use client";

// Panel de Integraciones — aplicaciones conectadas vía webhook universal.
// Muestra estado, último webhook, errores, URL + Bearer token, y permite
// conectar apps, enviar pruebas, regenerar tokens y ver logs.

import { useCallback, useState } from "react";
import {
  Webhook, Plus, Copy, Check, Eye, EyeOff, RefreshCw, Send,
  Trash2, ScrollText, ShieldCheck, AlertTriangle, Loader2, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/supabase";

type Integration = Database["public"]["Tables"]["webhook_integrations"]["Row"];

interface EventLog {
  id: string;
  source: string;
  event: string;
  status: string;
  error: string | null;
  contact_id: string | null;
  contact_created: boolean;
  automations_triggered: unknown;
  processing_ms: number | null;
  created_at: string;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "Nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Hace un momento";
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} d`;
}

const EVENT_STATUS_STYLE: Record<string, string> = {
  processed: "text-[#10b981]",
  received:  "text-sky-400",
  retrying:  "text-amber-400",
  failed:    "text-red-400",
  dead:      "text-red-500",
};

// ─── Copy-to-clipboard button ────────────────────────────────────────────────

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-muted-foreground hover:text-foreground"
      title={label ?? "Copiar"}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-[#10b981]" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

// ─── Secret field (masked token) ─────────────────────────────────────────────

function SecretField({ label, value }: { label: string; value: string }) {
  const [visible, setVisible] = useState(false);
  const masked = `${value.slice(0, 8)}${"•".repeat(16)}${value.slice(-4)}`;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0 w-24">
        {label}
      </span>
      <code className="text-xs bg-white/[0.04] border border-border rounded px-2 py-1 truncate flex-1 font-mono">
        {visible ? value : masked}
      </code>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-muted-foreground hover:text-foreground"
        onClick={() => setVisible((v) => !v)}
        title={visible ? "Ocultar" : "Mostrar"}
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
      <CopyButton value={value} />
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function IntegrationsPanel({
  initialIntegrations,
  webhookUrl,
}: {
  initialIntegrations: Integration[];
  webhookUrl: string;
}) {
  const [integrations, setIntegrations] = useState<Integration[]>(initialIntegrations);
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/integrations");
    if (res.ok) {
      const json = await res.json();
      setIntegrations(json.integrations ?? []);
    }
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Webhook className="h-5 w-5" style={{ color: "var(--brand)" }} />
            Integraciones
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Conecta cualquier aplicación a FlowAI enviando un POST al webhook universal.
            Cada evento crea o actualiza el contacto y dispara tus automatizaciones.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          Conectar aplicación
        </Button>
      </div>

      {/* Webhook URL global */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0 w-24">
              Webhook URL
            </span>
            <code className="text-xs bg-white/[0.04] border border-border rounded px-2 py-1 truncate flex-1 font-mono">
              POST {webhookUrl}
            </code>
            <CopyButton value={webhookUrl} />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Autenticación: cabecera <code className="font-mono">Authorization: Bearer &lt;token&gt;</code>.
            Con HMAC activo añade <code className="font-mono">x-flowai-signature</code> (HMAC-SHA256 hex del body).
          </p>
        </CardContent>
      </Card>

      {/* Lista de integraciones */}
      {integrations.length === 0 ? (
        <EmptyState
          icon={Webhook}
          title="Sin aplicaciones conectadas"
          description="Conecta tu primera aplicación para empezar a recibir leads por webhook."
        />
      ) : (
        <div className="space-y-4">
          {integrations.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              onChanged={refresh}
            />
          ))}
        </div>
      )}

      <CreateIntegrationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={refresh}
      />
    </div>
  );
}

// ─── Integration card ─────────────────────────────────────────────────────────

function IntegrationCard({
  integration,
  onChanged,
}: {
  integration: Integration;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy]             = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [logsOpen, setLogsOpen]     = useState(false);
  const [logs, setLogs]             = useState<EventLog[] | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const toggleEnabled = () =>
    run("toggle", async () => {
      await fetch(`/api/integrations/${integration.id}`, {
        method:  "PATCH",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ enabled: !integration.enabled }),
      });
      await onChanged();
    });

  const regenerate = () =>
    run("regenerate", async () => {
      await fetch(`/api/integrations/${integration.id}/regenerate`, { method: "POST" });
      await onChanged();
    });

  const sendTest = () =>
    run("test", async () => {
      setTestResult(null);
      const res  = await fetch(`/api/integrations/${integration.id}/test`, { method: "POST" });
      const json = await res.json().catch(() => null);
      const inner = json?.response;
      if (json?.success && inner?.success) {
        setTestResult({
          ok:   true,
          text: `Prueba OK — contacto ${inner.contact_created ? "creado" : "actualizado"}, ${
            Array.isArray(inner.automations_triggered) ? inner.automations_triggered.length : 0
          } automatización(es) disparada(s).`,
        });
      } else {
        setTestResult({
          ok:   false,
          text: `Fallo en la prueba: ${inner?.error ?? json?.error ?? `HTTP ${json?.status ?? "?"}`}`,
        });
      }
      await onChanged();
    });

  const loadLogs = () =>
    run("logs", async () => {
      const res = await fetch(`/api/integrations/${integration.id}/logs?limit=25`);
      if (res.ok) {
        const json = await res.json();
        setLogs(json.events ?? []);
        setLogsOpen(true);
      }
    });

  const remove = () =>
    run("delete", async () => {
      await fetch(`/api/integrations/${integration.id}`, { method: "DELETE" });
      setDeleteOpen(false);
      await onChanged();
    });

  const hasErrors = integration.total_errors > 0;
  const statusBadge = !integration.enabled
    ? { label: "Desactivada", variant: "secondary" as const }
    : integration.last_event_status === "failed"
      ? { label: "Con errores", variant: "outline" as const }
      : { label: "Activa", variant: "default" as const };

  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        {/* Header row */}
        <div className="flex items-center gap-3 flex-wrap">
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "color-mix(in srgb, var(--brand) 14%, transparent)" }}
          >
            <Zap className="h-4.5 w-4.5" style={{ color: "var(--brand)" }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate">{integration.name}</span>
              <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
              {integration.hmac_secret && (
                <Badge variant="outline" className="gap-1">
                  <ShieldCheck className="h-3 w-3" /> HMAC
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              source: <code className="font-mono">{integration.source_key}</code>
              {" · "}Último webhook: {formatRelative(integration.last_event_at)}
              {" · "}{integration.total_events} eventos
              {hasErrors && (
                <span className="text-red-400"> · {integration.total_errors} errores</span>
              )}
            </p>
          </div>
          <Switch
            checked={integration.enabled}
            onCheckedChange={toggleEnabled}
            disabled={busy === "toggle"}
          />
        </div>

        {/* Último error */}
        {integration.last_event_status === "failed" && integration.last_error && (
          <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/[0.06] border border-red-500/20 rounded-lg px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span className="break-all">{integration.last_error}</span>
          </div>
        )}

        {/* Credenciales */}
        <div className="space-y-2">
          <SecretField label="Bearer token" value={integration.token} />
          {integration.hmac_secret && (
            <SecretField label="HMAC secret" value={integration.hmac_secret} />
          )}
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <Button variant="outline" size="sm" onClick={sendTest} disabled={busy !== null}>
            {busy === "test"
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <Send className="h-3.5 w-3.5 mr-1.5" />}
            Enviar prueba
          </Button>
          <Button variant="outline" size="sm" onClick={regenerate} disabled={busy !== null}>
            {busy === "regenerate"
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Regenerar token
          </Button>
          <Button variant="outline" size="sm" onClick={loadLogs} disabled={busy !== null}>
            {busy === "logs"
              ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              : <ScrollText className="h-3.5 w-3.5 mr-1.5" />}
            Ver logs
          </Button>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            className="text-red-400 hover:text-red-300"
            onClick={() => setDeleteOpen(true)}
            disabled={busy !== null}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Resultado de la prueba */}
        {testResult && (
          <div
            className={cn(
              "text-xs rounded-lg px-3 py-2 border",
              testResult.ok
                ? "text-[#10b981] bg-emerald-500/[0.06] border-emerald-500/20"
                : "text-red-400 bg-red-500/[0.06] border-red-500/20"
            )}
          >
            {testResult.text}
          </div>
        )}
      </CardContent>

      {/* Logs dialog */}
      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Logs — {integration.name}</DialogTitle>
            <DialogDescription>Últimos webhooks recibidos de esta aplicación.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto space-y-2">
            {!logs || logs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Aún no se ha recibido ningún webhook.
              </p>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="border border-border rounded-lg px-3 py-2 text-xs space-y-1"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-medium">{log.event}</span>
                    <span className={cn("font-medium", EVENT_STATUS_STYLE[log.status] ?? "")}>
                      {log.status}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                    {typeof log.processing_ms === "number" && (
                      <span className="text-muted-foreground">· {log.processing_ms} ms</span>
                    )}
                    {log.contact_id && (
                      <span className="text-muted-foreground">
                        · contacto {log.contact_created ? "creado" : "actualizado"}
                      </span>
                    )}
                    {Array.isArray(log.automations_triggered) &&
                      log.automations_triggered.length > 0 && (
                        <span style={{ color: "var(--brand)" }}>
                          · {log.automations_triggered.length} automatización(es)
                        </span>
                      )}
                  </div>
                  {log.error && <p className="text-red-400 break-all">{log.error}</p>}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desconectar {integration.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              El token dejará de funcionar inmediatamente y se eliminará el historial de
              eventos de esta integración. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-500 text-white"
              onClick={remove}
            >
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ─── Create dialog ────────────────────────────────────────────────────────────

function CreateIntegrationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => Promise<void>;
}) {
  const [name, setName]       = useState("");
  const [tags, setTags]       = useState("");
  const [hmac, setHmac]       = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          hmacEnabled: hmac,
          defaultTags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error ?? `Error ${res.status}`);
        return;
      }
      setName("");
      setTags("");
      setHmac(false);
      onOpenChange(false);
      await onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conectar aplicación</DialogTitle>
          <DialogDescription>
            Se generará un Bearer token único. La aplicación solo tiene que enviar un
            POST al webhook con ese token.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="int-name">Nombre de la aplicación</Label>
            <Input
              id="int-name"
              placeholder="Transforma Fit Coach"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="int-tags">Etiquetas automáticas (separadas por coma)</Label>
            <Input
              id="int-tags"
              placeholder="fitness, lead-web"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Se añaden a cada contacto que llegue por esta integración.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" style={{ color: "var(--brand)" }} />
                Firma HMAC
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Seguridad extra: exige la cabecera x-flowai-signature en cada webhook.
              </p>
            </div>
            <Switch checked={hmac} onCheckedChange={setHmac} />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Conectar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
