"use client";

import { useState } from "react";
import { RefreshCw, Trash2, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export interface IGAccount {
  id:                string;
  ig_user_id:        string;
  ig_username:       string;
  avatar_url:        string | null;
  followers_count:   number;
  connection_state:  string;
  page_id:           string;
  page_name:         string | null;
  last_error:        string | null;
  last_synced_at:    string | null;
  token_expires_at:  string | null;
}

interface AccountCardProps {
  account:    IGAccount;
  onDisconnect: (id: string) => Promise<void>;
  onSync:       (id: string) => Promise<void>;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return diff > 0 ? Math.floor(diff / 86_400_000) : 0;
}

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function AccountCard({ account, onDisconnect, onSync }: AccountCardProps) {
  const [syncing,      setSyncing]      = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try { await onSync(account.id); } finally { setSyncing(false); }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try { await onDisconnect(account.id); } finally { setDisconnecting(false); }
  };

  const tokenDays = daysUntil(account.token_expires_at);
  const tokenWarning = tokenDays !== null && tokenDays <= 10;
  const tokenExpired = tokenDays !== null && tokenDays === 0;

  const stateConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "muted" }> = {
    connected:    { label: "Conectado",       variant: "success" },
    token_expired:{ label: "Token expirado",  variant: "destructive" },
    disconnected: { label: "Desconectado",    variant: "muted" },
    error:        { label: "Error",           variant: "destructive" },
  };
  const state = stateConfig[account.connection_state] ?? { label: account.connection_state, variant: "muted" as const };

  const initials = account.ig_username
    ? account.ig_username.slice(0, 2).toUpperCase()
    : "IG";

  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-border bg-card">
      <Avatar className="h-12 w-12 shrink-0">
        {account.avatar_url && <AvatarImage src={account.avatar_url} alt={account.ig_username} />}
        <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-sm font-semibold">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold truncate">@{account.ig_username || account.ig_user_id}</span>
          <Badge variant={state.variant} className="text-[10px] shrink-0">{state.label}</Badge>
        </div>

        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
          {account.followers_count > 0 && (
            <span>{formatFollowers(account.followers_count)} seguidores</span>
          )}
          {account.page_name && (
            <span className="truncate">Página: {account.page_name}</span>
          )}
          {account.last_synced_at && (
            <span>Sync: {new Date(account.last_synced_at).toLocaleDateString("es-ES")}</span>
          )}
        </div>

        {/* Token expiry warning */}
        {tokenWarning && !tokenExpired && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-500">
            <Clock className="h-3 w-3 shrink-0" />
            <span>El token expira en {tokenDays} {tokenDays === 1 ? "día" : "días"} — sincroniza para renovarlo</span>
          </div>
        )}
        {tokenExpired && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-destructive">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>Token expirado — reconecta la cuenta</span>
          </div>
        )}

        {/* API error */}
        {account.last_error && account.connection_state !== "connected" && (
          <p className="mt-1.5 text-[11px] text-destructive/80 truncate">{account.last_error}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={handleSync}
          disabled={syncing || disconnecting}
        >
          <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
          Sync
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={handleDisconnect}
          disabled={disconnecting || syncing}
        >
          <Trash2 className="h-3 w-3" />
          Desconectar
        </Button>
      </div>
    </div>
  );
}
