"use client";

import { useState } from "react";
import {
  CheckCircle2, XCircle, AlertCircle, Loader2, Copy, Check,
  Phone, Trash2, Send, Plus, ChevronDown, ChevronUp, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WACAccount } from "./page";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  accounts:    WACAccount[];
  webhookUrl:  string;
  metaReady:   boolean;
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ value, className }: { value: string; className?: string }) {
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
      className={cn("h-7 w-7 flex items-center justify-center rounded-md hover:bg-white/[0.06] text-muted-foreground hover:text-foreground transition-colors", className)}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-[color:var(--brand)]" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// ─── State badge ──────────────────────────────────────────────────────────────

function StateBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; className: string }> = {
    connected:    { label: "Conectado",    className: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30" },
    disconnected: { label: "Desconectado", className: "text-muted-foreground bg-muted border-border" },
    token_expired:{ label: "Token expirado", className: "text-amber-400 bg-amber-400/10 border-amber-400/30" },
    error:        { label: "Error",        className: "text-red-400 bg-red-400/10 border-red-400/30" },
  };
  const cfg = map[state] ?? map.disconnected;
  return (
    <Badge variant="outline" className={cn("text-[10px] font-medium shrink-0", cfg.className)}>
      {cfg.label}
    </Badge>
  );
}

// ─── Connect form ─────────────────────────────────────────────────────────────

interface ConnectFormProps {
  onConnected: (account: WACAccount) => void;
}

function ConnectForm({ onConnected }: ConnectFormProps) {
  const [open, setOpen]   = useState(false);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm]   = useState({ wabaId: "", phoneNumberId: "", systemUserToken: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/meta/connect/wac", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json() as { ok?: boolean; error?: string; accountId?: string; phoneNumberId?: string; displayPhoneNumber?: string | null; verifiedName?: string | null; connectionState?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Error desconocido");
      onConnected({
        id:                 data.accountId ?? "",
        wabaId:             form.wabaId,
        phoneNumberId:      data.phoneNumberId ?? form.phoneNumberId,
        displayPhoneNumber: data.displayPhoneNumber ?? null,
        verifiedName:       data.verifiedName ?? null,
        connectionState:    data.connectionState ?? "connected",
        lastError:          null,
        lastSyncedAt:       new Date().toISOString(),
        isActive:           true,
        createdAt:          new Date().toISOString(),
      });
      setForm({ wabaId: "", phoneNumberId: "", systemUserToken: "" });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-white/[0.03] rounded-lg transition-colors"
      >
        <span className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-[color:var(--brand)]" />
          Conectar número de WhatsApp
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="px-4 pb-4 space-y-4 border-t border-border pt-4">
          <div className="space-y-1.5">
            <Label className="text-xs">WABA ID <span className="text-muted-foreground">(WhatsApp Business Account ID)</span></Label>
            <Input
              value={form.wabaId}
              onChange={(e) => setForm((f) => ({ ...f, wabaId: e.target.value }))}
              placeholder="123456789012345"
              className="h-8 text-xs font-mono"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Phone Number ID <span className="text-muted-foreground">(de Meta Business Suite)</span></Label>
            <Input
              value={form.phoneNumberId}
              onChange={(e) => setForm((f) => ({ ...f, phoneNumberId: e.target.value }))}
              placeholder="987654321098765"
              className="h-8 text-xs font-mono"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">System User Token <span className="text-muted-foreground">(nunca expira)</span></Label>
            <Input
              type="password"
              value={form.systemUserToken}
              onChange={(e) => setForm((f) => ({ ...f, systemUserToken: e.target.value }))}
              placeholder="EAAxxxxxxxxxxxxx…"
              className="h-8 text-xs font-mono"
              required
            />
            <p className="text-[10px] text-muted-foreground">
              Generado en Meta Business Suite → Configuración → Usuarios del sistema. El token se cifra con AES-256-GCM antes de guardarse.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" size="sm" className="h-7 text-xs" disabled={busy}>
              {busy && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
              {busy ? "Verificando…" : "Conectar"}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Account card ─────────────────────────────────────────────────────────────

interface AccountCardProps {
  account: WACAccount;
  onDisconnect: (id: string) => void;
}

function AccountCard({ account, onDisconnect }: AccountCardProps) {
  const [testPhone, setTestPhone]   = useState("");
  const [testOpen, setTestOpen]     = useState(false);
  const [testBusy, setTestBusy]     = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleTest(e: React.FormEvent) {
    e.preventDefault();
    setTestBusy(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/meta/test-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "wac", accountId: account.id, to: testPhone }),
      });
      const data = await res.json() as { ok?: boolean; wamid?: string; error?: string };
      if (data.ok) {
        setTestResult({ ok: true, message: `Enviado. WAMID: ${data.wamid ?? "—"}` });
      } else {
        setTestResult({ ok: false, message: data.error ?? "Error desconocido" });
      }
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : "Error de red" });
    } finally {
      setTestBusy(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/meta/connect/wac", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: account.id }),
      });
      if (res.ok) onDisconnect(account.id);
    } finally {
      setDisconnecting(false);
    }
  }

  const label = account.verifiedName ?? account.displayPhoneNumber ?? account.phoneNumberId;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="h-8 w-8 rounded-lg bg-[#25D366]/10 flex items-center justify-center shrink-0">
          <Phone className="h-4 w-4 text-[#25D366]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground truncate">{label}</p>
          {account.displayPhoneNumber && (
            <p className="text-[10px] text-muted-foreground">{account.displayPhoneNumber}</p>
          )}
          <p className="text-[10px] text-muted-foreground font-mono">WABA: {account.wabaId}</p>
        </div>
        <StateBadge state={account.connectionState} />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="sm"
            className="h-7 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => { setTestOpen((v) => !v); setTestResult(null); }}
          >
            <Send className="h-3 w-3" />
            Test
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-red-400"
            onClick={handleDisconnect}
            disabled={disconnecting}
            title="Desconectar"
          >
            {disconnecting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {account.lastError && (
        <div className="px-4 pb-2">
          <p className="text-[10px] text-red-400 truncate">{account.lastError}</p>
        </div>
      )}

      {testOpen && (
        <form onSubmit={handleTest} className="px-4 pb-3 pt-2 border-t border-border space-y-2">
          <p className="text-[10px] text-muted-foreground font-medium">Enviar mensaje de prueba</p>
          <div className="flex gap-2">
            <Input
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="+5491112345678"
              className="h-7 text-xs flex-1 font-mono"
              required
            />
            <Button type="submit" size="sm" className="h-7 text-xs shrink-0" disabled={testBusy}>
              {testBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Enviar"}
            </Button>
          </div>
          {testResult && (
            <div className={cn(
              "flex items-start gap-1.5 text-[10px] rounded-md px-2.5 py-1.5",
              testResult.ok ? "text-emerald-400 bg-emerald-400/10" : "text-red-400 bg-red-400/10"
            )}>
              {testResult.ok
                ? <CheckCircle2 className="h-3 w-3 shrink-0 mt-0.5" />
                : <XCircle className="h-3 w-3 shrink-0 mt-0.5" />}
              {testResult.message}
            </div>
          )}
        </form>
      )}
    </div>
  );
}

// ─── Main client ──────────────────────────────────────────────────────────────

export function WhatsAppCloudClient({ accounts: initial, webhookUrl, metaReady }: Props) {
  const [accounts, setAccounts] = useState<WACAccount[]>(initial);

  function handleConnected(account: WACAccount) {
    setAccounts((prev) => {
      const idx = prev.findIndex((a) => a.phoneNumberId === account.phoneNumberId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = account;
        return next;
      }
      return [account, ...prev];
    });
  }

  function handleDisconnect(id: string) {
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }

  const active = accounts.filter((a) => a.isActive && a.connectionState === "connected");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-[#25D366]/10 flex items-center justify-center">
            <Phone className="h-4 w-4 text-[#25D366]" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">WhatsApp Cloud API</h1>
            <p className="text-xs text-muted-foreground">
              {active.length} número{active.length !== 1 ? "s" : ""} conectado{active.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-muted-foreground" asChild>
          <a href="https://developers.facebook.com/docs/whatsapp/cloud-api" target="_blank" rel="noreferrer">
            <ExternalLink className="h-3 w-3" />
            Docs
          </a>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl space-y-6">

          {/* Meta config warning */}
          {!metaReady && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-300 space-y-1">
                <p className="font-medium">Variables de entorno Meta no configuradas</p>
                <p className="text-amber-400/80">
                  Configura <code className="font-mono">META_APP_ID</code>, <code className="font-mono">META_APP_SECRET</code> y <code className="font-mono">META_WEBHOOK_VERIFY_TOKEN</code> para usar el webhook unificado.
                </p>
              </div>
            </div>
          )}

          {/* Webhook URL */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Webhook URL</p>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <code className="text-xs font-mono text-foreground flex-1 truncate">{webhookUrl || "NEXT_PUBLIC_BASE_URL no configurada"}</code>
              {webhookUrl && <CopyButton value={webhookUrl} />}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Configura esta URL en Meta Developers → Tu App → WhatsApp → Configuración → Webhooks.
            </p>
          </div>

          {/* Connected accounts */}
          {accounts.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Números conectados</p>
              {accounts.map((acc) => (
                <AccountCard key={acc.id} account={acc} onDisconnect={handleDisconnect} />
              ))}
            </div>
          )}

          {/* Connect form */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Agregar número</p>
            <ConnectForm onConnected={handleConnected} />
          </div>

          {/* Quick guide */}
          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Guía rápida</p>
            <ol className="space-y-2 text-xs text-muted-foreground list-decimal list-inside">
              {[
                "Crea una App en developers.facebook.com → tipo Business.",
                "Agrega el producto \"WhatsApp\" a la app.",
                "Anota el WABA ID y el Phone Number ID desde la sección de configuración.",
                "Ve a Business Suite → Configuración → Usuarios del sistema → genera un token permanente con permisos whatsapp_business_messaging.",
                "Pega el webhook URL de arriba en Meta → Webhooks, con el Verify Token de META_WEBHOOK_VERIFY_TOKEN.",
                "Suscribe los campos: messages, messaging_postbacks, message_deliveries, message_reads.",
                "Conecta el número en esta página.",
              ].map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
