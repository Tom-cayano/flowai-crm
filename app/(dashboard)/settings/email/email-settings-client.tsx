"use client";

// Ajustes del canal Email (Resend) — multi-tenant: cada organización guarda
// su propia API key, remitente y secreto de webhook. Incluye el gestor de
// plantillas editable y los últimos envíos con su tracking.

import { useCallback, useEffect, useState } from "react";
import { Mail, Save, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

interface Tpl { id: string; slug: string; name: string; subject: string; body_html: string }
interface Log {
  id: string; to_email: string; subject: string; status: string;
  template_slug: string | null; opened_at: string | null; clicked_at: string | null;
  error: string | null; created_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  delivered: "text-emerald-400", sent: "text-sky-400", queued: "text-muted-foreground",
  bounced: "text-red-400", failed: "text-red-400", complained: "text-red-400", delayed: "text-amber-400",
};

export function EmailSettingsClient() {
  const [settings, setSettings]   = useState({ resend_api_key: "", from_email: "", from_name: "", reply_to: "", webhook_secret: "", enabled: false });
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [logs, setLogs]           = useState<Log[]>([]);
  const [selected, setSelected]   = useState<Tpl | null>(null);
  const [testTo, setTestTo]       = useState("");
  const [busy, setBusy]           = useState<string | null>(null);
  const [notice, setNotice]       = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/email/settings");
    if (!res.ok) return;
    const json = await res.json();
    if (json.settings) {
      setSettings({
        resend_api_key: json.settings.resend_api_key ?? "",
        from_email:     json.settings.from_email ?? "",
        from_name:      json.settings.from_name ?? "",
        reply_to:       json.settings.reply_to ?? "",
        webhook_secret: json.settings.webhook_secret ?? "",
        enabled:        json.settings.enabled ?? false,
      });
    }
    setTemplates(json.templates ?? []);
    setLogs(json.logs ?? []);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const saveSettings = async () => {
    setBusy("settings"); setNotice(null);
    const res = await fetch("/api/email/settings", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify(settings),
    });
    setNotice(res.ok ? "Configuración guardada ✓" : "Error al guardar");
    setBusy(null);
    await load();
  };

  const saveTemplate = async () => {
    if (!selected) return;
    setBusy("template");
    const res = await fetch("/api/email/templates", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: selected.id, subject: selected.subject, body_html: selected.body_html }),
    });
    setNotice(res.ok ? `Plantilla "${selected.name}" guardada ✓` : "Error al guardar la plantilla");
    setBusy(null);
    await load();
  };

  const sendTest = async () => {
    if (!selected || !testTo) return;
    setBusy("test");
    const res = await fetch("/api/email/templates", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: selected.slug, to: testTo }),
    });
    const json = await res.json().catch(() => null);
    setNotice(res.ok ? "Email de prueba encolado ✓" : (json?.error ?? "Error en el envío de prueba"));
    setBusy(null);
    await load();
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Mail className="h-5 w-5" style={{ color: "var(--brand)" }} />
          Canal Email (Resend)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Conecta tu cuenta de Resend para enviar emails desde las automatizaciones,
          recordatorios de citas y confirmaciones de reserva. Webhook de estados:{" "}
          <code className="font-mono text-xs">/api/webhook/resend</code>
        </p>
      </div>

      {notice && <p className="text-sm" style={{ color: "var(--brand)" }}>{notice}</p>}

      {/* Configuración */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Configuración</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">API key de Resend</Label>
              <Input value={settings.resend_api_key} placeholder="re_..." type="password"
                onChange={(e) => setSettings({ ...settings, resend_api_key: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Secreto del webhook (svix)</Label>
              <Input value={settings.webhook_secret} placeholder="whsec_..."
                onChange={(e) => setSettings({ ...settings, webhook_secret: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email remitente (dominio verificado en Resend)</Label>
              <Input value={settings.from_email} placeholder="hola@tudominio.com"
                onChange={(e) => setSettings({ ...settings, from_email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre del remitente</Label>
              <Input value={settings.from_name} placeholder="Love Fitness Murcia"
                onChange={(e) => setSettings({ ...settings, from_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Responder a (opcional)</Label>
              <Input value={settings.reply_to} placeholder="info@tudominio.com"
                onChange={(e) => setSettings({ ...settings, reply_to: e.target.value })} />
            </div>
            <div className="flex items-end justify-between rounded-lg border border-border px-3 py-2.5">
              <span className="text-sm">Canal activo</span>
              <Switch checked={settings.enabled}
                onCheckedChange={(v) => setSettings({ ...settings, enabled: v })} />
            </div>
          </div>
          <Button onClick={saveSettings} disabled={busy !== null} size="sm">
            {busy === "settings" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Guardar configuración
          </Button>
        </CardContent>
      </Card>

      {/* Plantillas */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Plantillas</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <Button key={t.id} size="sm" variant={selected?.id === t.id ? "default" : "outline"}
                onClick={() => setSelected({ ...t })}>
                {t.name}
              </Button>
            ))}
          </div>
          {selected && (
            <div className="space-y-3 border-t border-border pt-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Asunto (admite {"{{variables}}"})</Label>
                <Input value={selected.subject}
                  onChange={(e) => setSelected({ ...selected, subject: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Contenido HTML (se envuelve en el diseño responsive)</Label>
                <Textarea rows={10} className="font-mono text-xs" value={selected.body_html}
                  onChange={(e) => setSelected({ ...selected, body_html: e.target.value })} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={saveTemplate} disabled={busy !== null}>
                  {busy === "template" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                  Guardar plantilla
                </Button>
                <Input className="w-56 h-8 text-xs" placeholder="email@para-prueba.com"
                  value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                <Button size="sm" variant="outline" onClick={sendTest} disabled={busy !== null || !testTo}>
                  {busy === "test" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                  Enviar prueba
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Últimos envíos */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Últimos envíos</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          {logs.length === 0 && <p className="text-xs text-muted-foreground">Aún no se ha enviado ningún email.</p>}
          {logs.map((l) => (
            <div key={l.id} className="flex items-center gap-2 text-xs border-b border-border/40 last:border-0 py-1.5 flex-wrap">
              <span className={`font-medium ${STATUS_COLOR[l.status] ?? ""}`}>{l.status}</span>
              <span className="text-foreground truncate max-w-[220px]">{l.subject}</span>
              <span className="text-muted-foreground">→ {l.to_email}</span>
              {l.opened_at && <Badge variant="outline" className="text-[10px]">abierto</Badge>}
              {l.clicked_at && <Badge variant="outline" className="text-[10px]">click</Badge>}
              {l.error && <span className="text-red-400 truncate max-w-[240px]">{l.error}</span>}
              <span className="ml-auto text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
