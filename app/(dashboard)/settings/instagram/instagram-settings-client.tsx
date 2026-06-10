"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Plus, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountCard, type IGAccount } from "@/components/instagram/account-card";

interface Props {
  initialAccounts: IGAccount[];
  allowed:         boolean;
  successCount?:   number;
  errorCode?:      string;
}

const ERROR_MESSAGES: Record<string, string> = {
  denied:          "Denegaste el acceso a MessageCircle. Puedes intentarlo de nuevo.",
  missing_code:    "El proceso de autorización fue interrumpido. Inténtalo de nuevo.",
  no_ig_account:   "La cuenta de Facebook no tiene ninguna cuenta de MessageCircle Business vinculada.",
  plan_required:   "Esta función requiere el plan Pro o superior.",
  oauth_failed:    "Ocurrió un error durante la autorización. Inténtalo de nuevo.",
};

export function InstagramSettingsClient({ initialAccounts, allowed, successCount, errorCode }: Props) {
  const router  = useRouter();
  const [accounts, setAccounts] = useState<IGAccount[]>(initialAccounts);

  const handleDisconnect = async (id: string) => {
    const res = await fetch(`/api/instagram/accounts?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      router.refresh();
    }
  };

  const handleSync = async (id: string) => {
    const res = await fetch("/api/instagram/accounts", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ accountId: id }),
    });
    if (res.ok) {
      router.refresh();
    }
  };

  return (
    <div className="p-8 max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <MessageCircle className="h-4 w-4" />
            <h2 className="text-base font-semibold">MessageCircle DMs</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Conecta cuentas de MessageCircle Business para gestionar mensajes directos desde tu bandeja de entrada.
          </p>
        </div>

        {allowed && (
          <Button asChild size="sm" className="h-8 text-xs gap-1.5 shrink-0">
            <a href="/api/instagram/oauth/start" rel="noreferrer noopener">
              <Plus className="h-3.5 w-3.5" />
              Conectar cuenta
            </a>
          </Button>
        )}
      </div>

      {/* Success banner */}
      {successCount !== undefined && successCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          <MessageCircle className="h-4 w-4 shrink-0" />
          {successCount === 1
            ? "Cuenta de MessageCircle conectada correctamente."
            : `${successCount} cuentas de MessageCircle conectadas correctamente.`}
        </div>
      )}

      {/* Error banner */}
      {errorCode && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {ERROR_MESSAGES[errorCode] ?? "Ocurrió un error inesperado. Inténtalo de nuevo."}
        </div>
      )}

      {/* Plan gate */}
      {!allowed && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Función exclusiva del plan Pro</p>
            <p className="text-xs text-muted-foreground mt-1">
              Actualiza tu plan para conectar cuentas de MessageCircle Business.
            </p>
          </div>
          <Button asChild size="sm" className="text-xs h-8">
            <Link href="/settings/billing">Ver planes</Link>
          </Button>
        </div>
      )}

      {/* Accounts list */}
      {allowed && (
        <>
          {accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/30 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20">
                <MessageCircle className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Sin cuentas conectadas</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Conecta una cuenta de MessageCircle Business para empezar a recibir mensajes.
                </p>
              </div>
              <Button asChild size="sm" className="text-xs h-8 gap-1.5">
                <a href="/api/instagram/oauth/start" rel="noreferrer noopener">
                  <Plus className="h-3.5 w-3.5" />
                  Conectar cuenta
                </a>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {accounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  onDisconnect={handleDisconnect}
                  onSync={handleSync}
                />
              ))}
            </div>
          )}

          <div className="rounded-lg border border-border bg-muted/20 p-4 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground/70">Requisitos para conectar MessageCircle</p>
            <ul className="list-disc list-inside space-y-0.5 mt-1">
              <li>Necesitas una cuenta de MessageCircle Business (no personal)</li>
              <li>La cuenta debe estar vinculada a una Página de Facebook</li>
              <li>Debes ser administrador de la Página de Facebook</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
