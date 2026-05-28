"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendResetEmail, type ForgotPasswordState } from "./actions";

export function ForgotPasswordForm({ sent }: { sent: boolean }) {
  const [state, action, isPending] = useActionState<ForgotPasswordState, FormData>(
    sendResetEmail,
    undefined
  );

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <div className="flex justify-center">
          <CheckCircle2 className="h-12 w-12 text-[#10b981]" />
        </div>
        <h2 className="text-lg font-semibold">Revisa tu correo</h2>
        <p className="text-sm text-muted-foreground">
          Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña en los próximos minutos.
        </p>
        <Link href="/login">
          <Button variant="outline" className="w-full mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al inicio de sesión
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {state?.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {state.error}
        </div>
      )}

      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs font-medium">
            Correo electrónico
          </Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="tu@empresa.com"
              required
              autoComplete="email"
              disabled={isPending}
              className="h-10 pl-9 text-sm"
            />
          </div>
        </div>

        <Button type="submit" disabled={isPending} className="w-full h-10 font-semibold">
          {isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />Enviando…</>
          ) : (
            "Enviar enlace de recuperación"
          )}
        </Button>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        <Link href="/login" className="inline-flex items-center gap-1 text-primary hover:underline">
          <ArrowLeft className="h-3 w-3" />
          Volver al inicio de sesión
        </Link>
      </p>
    </div>
  );
}
