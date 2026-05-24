"use client";

import { useState, useTransition } from "react";
import {
  Smartphone,
  Wifi,
  WifiOff,
  Loader2,
  Trash2,
  QrCode,
  LogOut,
  MoreVertical,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { deleteInstance, disconnectInstance, syncInstanceState } from "@/lib/actions/whatsapp-instances";
import { QRModal } from "./qr-modal";
import type { WhatsAppInstance } from "@/lib/actions/whatsapp-instances";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InstanceCardProps {
  instance: WhatsAppInstance;
  onDeleted: (id: string) => void;
  onStateChange: (id: string, state: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StateIndicator({ state }: { state: string }) {
  if (state === "open") {
    return (
      <span className="flex items-center gap-1.5 text-[#10b981]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#10b981] animate-pulse" />
        <span className="text-[11px] font-medium">Conectado</span>
      </span>
    );
  }
  if (state === "connecting") {
    return (
      <span className="flex items-center gap-1.5 text-amber-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="text-[11px] font-medium">Conectando…</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
      <span className="text-[11px] font-medium">Desconectado</span>
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InstanceCard({ instance, onDeleted, onStateChange }: InstanceCardProps) {
  const [showQR, setShowQR] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<"delete" | "disconnect" | "sync" | null>(null);

  const isConnected = instance.connection_state === "open";

  function handleDelete() {
    if (!confirm(`¿Eliminar la instancia "${instance.label}"? Esta acción no se puede deshacer.`)) return;
    setPendingAction("delete");
    startTransition(async () => {
      const result = await deleteInstance(instance.id);
      setPendingAction(null);
      if (result.error) {
        alert(`Error: ${result.error}`);
        return;
      }
      onDeleted(instance.id);
    });
  }

  function handleDisconnect() {
    setPendingAction("disconnect");
    startTransition(async () => {
      const result = await disconnectInstance(instance.id);
      setPendingAction(null);
      if (result.error) {
        alert(`Error: ${result.error}`);
        return;
      }
      onStateChange(instance.id, "close");
    });
  }

  function handleSync() {
    setPendingAction("sync");
    startTransition(async () => {
      const result = await syncInstanceState(instance.id);
      setPendingAction(null);
      if (result.data) {
        onStateChange(instance.id, result.data.state);
      }
    });
  }

  return (
    <>
      <div
        className={cn(
          "group relative flex flex-col gap-3 p-4 rounded-xl border bg-card transition-all duration-200",
          isConnected
            ? "border-[#10b981]/20 shadow-[0_0_0_1px_rgba(16,185,129,0.1)]"
            : "border-border hover:border-border/80"
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {/* Icon */}
            <div
              className={cn(
                "shrink-0 h-9 w-9 rounded-lg flex items-center justify-center",
                isConnected
                  ? "bg-[#10b981]/10"
                  : "bg-muted"
              )}
            >
              {isConnected ? (
                <Wifi className="h-4 w-4 text-[#10b981]" />
              ) : (
                <WifiOff className="h-4 w-4 text-muted-foreground" />
              )}
            </div>

            {/* Label + instance name */}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate leading-tight">
                {instance.label}
              </p>
              <p className="text-[11px] text-muted-foreground truncate font-mono mt-0.5">
                {instance.instance_name}
              </p>
            </div>
          </div>

          {/* Actions menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MoreVertical className="h-3.5 w-3.5" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={handleSync} disabled={pendingAction === "sync"}>
                <RefreshCw className="h-3.5 w-3.5 mr-2" />
                Sincronizar estado
              </DropdownMenuItem>
              {isConnected && (
                <DropdownMenuItem
                  onClick={handleDisconnect}
                  disabled={pendingAction === "disconnect"}
                  className="text-amber-400 focus:text-amber-400"
                >
                  <LogOut className="h-3.5 w-3.5 mr-2" />
                  Desconectar
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                disabled={pendingAction === "delete"}
                className="text-red-400 focus:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Eliminar instancia
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Status row */}
        <div className="flex items-center justify-between">
          <StateIndicator state={instance.connection_state ?? "close"} />

          {instance.phone_number && (
            <span className="text-[11px] text-muted-foreground font-mono">
              +{instance.phone_number}
            </span>
          )}
        </div>

        {/* Connect button (only when not connected) */}
        {!isConnected && (
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-1.5 text-xs border-[#10b981]/30 text-[#10b981] hover:bg-[#10b981]/5 hover:border-[#10b981]/50"
            onClick={() => setShowQR(true)}
            disabled={isPending}
          >
            <QrCode className="h-3.5 w-3.5" />
            Conectar WhatsApp
          </Button>
        )}

        {/* Phone chip (connected state) */}
        {isConnected && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#10b981]/5 border border-[#10b981]/10">
            <Smartphone className="h-3.5 w-3.5 text-[#10b981] shrink-0" />
            <span className="text-[11px] text-[#10b981] font-medium truncate">
              {instance.display_name ?? instance.phone_number ?? "Dispositivo vinculado"}
            </span>
          </div>
        )}
      </div>

      {/* QR Modal */}
      {showQR && (
        <QRModal
          instanceName={instance.instance_name}
          onConnected={() => {
            setShowQR(false);
            onStateChange(instance.id, "open");
          }}
          onClose={() => setShowQR(false)}
        />
      )}
    </>
  );
}
