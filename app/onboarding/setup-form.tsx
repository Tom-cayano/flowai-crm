"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Sparkles, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/ui/logo";

export function SetupForm() {
  const router = useRouter();
  const [name, setName]       = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/workspace", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: trimmed }),
      });

      const data = await res.json() as { workspace?: { id: string }; error?: string };

      if (!res.ok || !data.workspace) {
        throw new Error(data.error ?? "Error al crear workspace");
      }

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Logo size={28} />
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card p-8 shadow-xl">
          {/* Icon + heading */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="h-12 w-12 rounded-2xl bg-[#10b981]/10 border border-[#10b981]/20 flex items-center justify-center mb-4">
              <Building2 className="h-6 w-6 text-[#10b981]" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Crea tu workspace</h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-[260px]">
              Dale un nombre a tu organización para comenzar a usar FlowAI CRM.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Nombre del workspace</Label>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Acme Inc."
                className="h-9 text-sm"
                maxLength={60}
                disabled={loading}
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Puede ser tu empresa, marca o nombre de equipo.
              </p>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full h-9 bg-[#10b981] hover:bg-[#0ea572] text-[#030712] text-sm font-semibold"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Crear workspace
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Footer note */}
        <div className="flex items-center justify-center gap-1.5 mt-6 text-[11px] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-[#10b981]" />
          Incluye 14 días de prueba gratuita en el plan Pro
        </div>
      </motion.div>
    </div>
  );
}
