"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Loader2, Mail, Lock, Eye, EyeOff, AlertCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  signInWithPassword,
  signInWithGoogle,
  signInWithGitHub,
  type AuthActionState,
} from "./actions";

// ── Submit button — must live inside <form> to access useFormStatus ──────────

function SubmitButton({ isPending }: { isPending: boolean }) {
  return (
    <Button
      type="submit"
      disabled={isPending}
      className="w-full h-10 font-semibold tracking-wide"
    >
      {isPending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Iniciando sesión…
        </>
      ) : (
        "Iniciar sesión"
      )}
    </Button>
  );
}

// ── OAuth submit button — tracks its own form's pending state ────────────────

function OAuthSubmitButton({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="outline"
      disabled={pending}
      className="w-full h-10 gap-2.5 text-sm font-medium"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {pending ? "Redirigiendo…" : label}
    </Button>
  );
}

// ── Google icon ──────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

// ── GitHub icon ──────────────────────────────────────────────────────────────

function GitHubIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0 fill-current"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

// ── Main form component ──────────────────────────────────────────────────────

interface LoginFormProps {
  redirectTo?: string;
  initialMessage?: string;
}

export function LoginForm({ redirectTo, initialMessage }: LoginFormProps) {
  const [state, action, isPending] = useActionState<AuthActionState, FormData>(
    signInWithPassword,
    undefined
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-5">
      {/* Info message (e.g. magic link sent) */}
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

      {/* Email / password form */}
      <form action={action} className="space-y-4">
        {redirectTo && (
          <input type="hidden" name="redirectTo" value={redirectTo} />
        )}

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

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-xs font-medium">
              Contraseña
            </Label>
            <Link
              href="/forgot-password"
              className="text-[11px] text-primary transition-colors hover:underline"
              tabIndex={-1}
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              disabled={isPending}
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
        </div>

        <SubmitButton isPending={isPending} />
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-[11px] text-muted-foreground">o continuar con</span>
        <Separator className="flex-1" />
      </div>

      {/* OAuth buttons — each needs its own <form> so useFormStatus works */}
      <div className="grid grid-cols-2 gap-2">
        <form action={signInWithGoogle}>
          <OAuthSubmitButton icon={<GoogleIcon />} label="Google" />
        </form>
        <form action={signInWithGitHub}>
          <OAuthSubmitButton icon={<GitHubIcon />} label="GitHub" />
        </form>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        ¿No tienes cuenta?{" "}
        <Link
          href="/signup"
          className="font-medium text-primary transition-colors hover:underline"
        >
          Crear cuenta gratis
        </Link>
      </p>
    </div>
  );
}
