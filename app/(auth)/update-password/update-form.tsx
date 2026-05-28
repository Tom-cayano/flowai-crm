"use client";

import { useActionState } from "react";
import { Loader2, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword, type UpdatePasswordState } from "./actions";

export function UpdatePasswordForm() {
  const [state, action, isPending] = useActionState<UpdatePasswordState, FormData>(
    updatePassword,
    undefined
  );
  const [showPwd, setShowPwd]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="space-y-5">
      {state?.error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <p className="text-sm text-red-400">{state.error}</p>
        </div>
      )}

      <form action={action} className="space-y-4">
        {/* Nueva contraseña */}
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs font-medium">
            Nueva contraseña
          </Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              name="password"
              type={showPwd ? "text" : "password"}
              placeholder="Mínimo 8 caracteres"
              required
              minLength={8}
              disabled={isPending}
              className="h-10 pl-9 pr-10 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPwd((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Confirmar contraseña */}
        <div className="space-y-1.5">
          <Label htmlFor="confirm" className="text-xs font-medium">
            Confirmar contraseña
          </Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="confirm"
              name="confirm"
              type={showConfirm ? "text" : "password"}
              placeholder="Repite la contraseña"
              required
              disabled={isPending}
              className="h-10 pl-9 pr-10 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showConfirm ? "Ocultar confirmación" : "Mostrar confirmación"}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" disabled={isPending} className="w-full h-10 font-semibold">
          {isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />Actualizando…</>
          ) : (
            "Actualizar contraseña"
          )}
        </Button>
      </form>
    </div>
  );
}
