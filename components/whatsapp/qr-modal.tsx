"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, RefreshCw, CheckCircle2, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface QRModalProps {
  instanceName: string;
  onConnected: () => void;
  onClose: () => void;
}

type QRState =
  | { phase: "loading" }
  | { phase: "qr"; base64: string }
  | { phase: "error"; message: string }
  | { phase: "connected" };

// ─── Constants ────────────────────────────────────────────────────────────────

const QR_POLL_MS = 3_000;   // refresh QR every 3 s
const STATUS_POLL_MS = 2_000; // check connection state every 2 s

// ─── Component ────────────────────────────────────────────────────────────────

export function QRModal({ instanceName, onConnected, onClose }: QRModalProps) {
  const [state, setState] = useState<QRState>({ phase: "loading" });
  const qrTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (qrTimerRef.current) clearInterval(qrTimerRef.current);
    if (statusTimerRef.current) clearInterval(statusTimerRef.current);
  }, []);

  // ── Fetch QR from the proxy route ────────────────────────────────────────
  const fetchQR = useCallback(async () => {
    try {
      const res = await fetch(`/api/whatsapp/instances/${instanceName}/qr`);
      const json = (await res.json()) as {
        base64?: string;
        connected?: boolean;
        error?: string;
      };

      if (json.connected) {
        setState({ phase: "connected" });
        stopPolling();
        setTimeout(onConnected, 1_200); // brief "connected" flash
        return;
      }

      if (res.status === 202) {
        // QR not ready yet — keep "loading" until next poll
        return;
      }

      if (!res.ok || json.error) {
        setState({ phase: "error", message: json.error ?? "Error desconocido" });
        stopPolling();
        return;
      }

      if (json.base64) {
        setState({ phase: "qr", base64: json.base64 });
      }
    } catch {
      setState({ phase: "error", message: "No se pudo contactar el servidor" });
      stopPolling();
    }
  }, [instanceName, onConnected, stopPolling]);

  // ── Poll connection status independently ──────────────────────────────────
  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/whatsapp/instances/${instanceName}/status`);
      if (!res.ok) return;
      const { state: s } = (await res.json()) as { state: string };
      if (s === "open") {
        setState({ phase: "connected" });
        stopPolling();
        setTimeout(onConnected, 1_200);
      }
    } catch {
      // silent — status poll is best-effort
    }
  }, [instanceName, onConnected, stopPolling]);

  // ── Start polling on mount ────────────────────────────────────────────────
  useEffect(() => {
    fetchQR();
    qrTimerRef.current = setInterval(fetchQR, QR_POLL_MS);
    statusTimerRef.current = setInterval(pollStatus, STATUS_POLL_MS);

    return stopPolling;
  }, [fetchQR, pollStatus, stopPolling]);

  // ── Handle manual retry ───────────────────────────────────────────────────
  function retry() {
    setState({ phase: "loading" });
    stopPolling();
    fetchQR();
    qrTimerRef.current = setInterval(fetchQR, QR_POLL_MS);
    statusTimerRef.current = setInterval(pollStatus, STATUS_POLL_MS);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-sm mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-[#10b981]/10 flex items-center justify-center">
              <Smartphone className="h-4 w-4 text-[#10b981]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Conectar WhatsApp
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {instanceName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* QR display area */}
          <div
            className={cn(
              "relative mx-auto rounded-xl overflow-hidden",
              "flex items-center justify-center",
              "w-64 h-64 bg-white"
            )}
          >
            {state.phase === "loading" && (
              <div className="flex flex-col items-center gap-3 text-zinc-400">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="text-xs">Generando QR…</span>
              </div>
            )}

            {state.phase === "qr" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={state.base64}
                alt="WhatsApp QR Code"
                className="w-full h-full object-contain"
              />
            )}

            {state.phase === "error" && (
              <div className="flex flex-col items-center gap-3 px-4 text-center">
                <p className="text-xs text-red-400">{state.message}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={retry}
                  className="gap-1.5 text-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reintentar
                </Button>
              </div>
            )}

            {state.phase === "connected" && (
              <div className="flex flex-col items-center gap-3">
                <div className="h-16 w-16 rounded-full bg-[#10b981]/10 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-[#10b981]" />
                </div>
                <p className="text-sm font-semibold text-[#10b981]">
                  ¡Conectado!
                </p>
              </div>
            )}
          </div>

          {/* Instructions */}
          {(state.phase === "loading" || state.phase === "qr") && (
            <ol className="mt-5 space-y-2">
              {[
                "Abre WhatsApp en tu teléfono",
                "Ve a Ajustes → Dispositivos vinculados",
                'Pulsa "Vincular un dispositivo"',
                "Escanea este código QR",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="shrink-0 mt-0.5 h-4 w-4 rounded-full bg-[#10b981]/15 text-[#10b981] text-[10px] font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {/* Refresh button */}
          {state.phase === "qr" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={retry}
              className="w-full mt-4 gap-1.5 text-xs text-muted-foreground"
            >
              <RefreshCw className="h-3 w-3" />
              Actualizar QR
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
