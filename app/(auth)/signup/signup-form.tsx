"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Loader2, Mail, Lock, User, Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp, type SignupActionState } from "./actions";
import { cn } from "@/lib/utils";

// ── Password strength indicator ──────────────────────────────────────────────

type StrengthLevel = "empty" | "weak" | "fair" | "strong" | "great";

function getStrength(password: string): StrengthLevel {
  if (!password) return "empty";
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return "weak";
  if (score === 2) return "fair";
  if (score === 3) return "strong";
  return "great";
}

const strengthConfig: Record<
  StrengthLevel,
  { label: string; bars: number; color: string }
> = {
  empty: { label: "", bars: 0, color: "bg-muted" },
  weak: { label: "Débil", bars: 1, color: "bg-red-500" },
  fair: { label: "Regular", bars: 2, color: "bg-amber-500" },
  strong: { label: "Segura", bars: 3, color: "bg-blue-500" },
  great: { label: "Excelente", bars: 4, color: "bg-emerald-500" },
};

function PasswordStrength({ password }: { password: string }) {
  const level = getStrength(password);
  const { label, bars, color } = strengthConfig[level];
  if (!password) return null;

  return (
    <div className="space-y-1.5 mt-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              i <= bars ? color : "bg-muted"
            )}
          />
        ))}
      </div>
      {label && (
        <p
          className={cn("text-[11px] font-medium", {
            "text-red-400": level === "weak",
            "text-amber-400": level === "fair",
            "text-blue-400": level === "strong",
            "text-emerald-400": level === "great",
          })}
        >
          {label} contraseña
        </p>
      )}
    </div>
  );
}

// ── Password requirements checklist ─────────────────────────────────────────

function PasswordChecklist({ password }: { password: string }) {
  if (!password) return null;
  const checks = [
    { label: "Al menos 8 caracteres", met: password.length >= 8 },
    { label: "Una letra mayúscula", met: /[A-Z]/.test(password) },
    { label: "Un número", met: /[0-9]/.test(password) },
  ];
  return (
    <div className="mt-2 space-y-1">
      {checks.map((c) => (
        <div key={c.label} className="flex items-center gap-1.5">
          <CheckCircle2
            className={cn(
              "h-3 w-3 shrink-0 transition-colors",
              c.met ? "text-emerald-400" : "text-muted-foreground/40"
            )}
          />
          <span
            className={cn(
              "text-[11px] transition-colors",
              c.met ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {c.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main form ────────────────────────────────────────────────────────────────

interface SignupFormProps {
  initialMessage?: string;
}

export function SignupForm({ initialMessage }: SignupFormProps) {
  const [state, action, isPending] = useActionState<SignupActionState, FormData>(
    signUp,
    undefined
  );
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);

  return (
    <div className="space-y-5">
      {/* Success / info message */}
      {initialMessage && (
        <div className="flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm text-primary">{initialMessage}</p>
        </div>
      )}

      {/* Error banner */}
      {state?.error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <p className="text-sm text-red-400">{state.error}</p>
        </div>
      )}

      <form action={action} className="space-y-4">
        {/* Full name */}
        <div className="space-y-1.5">
          <Label htmlFor="full_name" className="text-xs font-medium">
            Nombre completo
          </Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="full_name"
              name="full_name"
              type="text"
              placeholder="Alex Johnson"
              required
              autoComplete="name"
              disabled={isPending}
              className="h-10 pl-9 text-sm"
            />
          </div>
        </div>

        {/* Work email */}
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs font-medium">
            Correo corporativo
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

        {/* Password with strength indicator */}
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs font-medium">
            Contraseña
          </Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="Mín. 8 caracteres"
              required
              minLength={8}
              autoComplete="new-password"
              disabled={isPending}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setShowChecklist(true)}
              className="h-10 pl-9 pr-10 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>

          <PasswordStrength password={password} />
          {showChecklist && <PasswordChecklist password={password} />}
        </div>

        <Button
          type="submit"
          disabled={isPending}
          className="w-full h-10 font-semibold tracking-wide"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creando cuenta…
            </>
          ) : (
            "Crear cuenta"
          )}
        </Button>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/login"
          className="font-medium text-primary transition-colors hover:underline"
        >
          Iniciar sesión
        </Link>
      </p>

      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
        Al registrarte aceptas nuestros{" "}
        <a href="#" className="underline underline-offset-2 transition-colors hover:text-foreground">
          Términos de servicio
        </a>{" "}
        y la{" "}
        <a href="#" className="underline underline-offset-2 transition-colors hover:text-foreground">
          Política de privacidad
        </a>
        .
      </p>
    </div>
  );
}
