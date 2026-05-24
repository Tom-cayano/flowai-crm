"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createAutomation } from "@/lib/actions/automations";

export default function NewAutomationPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createAutomation({ name: name.trim(), description: description.trim() });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/automations/${result.data!.id}`);
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => router.push("/automations")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-sm font-semibold text-foreground">Nueva automatización</h1>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <form onSubmit={handleSubmit} className="w-full max-w-md space-y-5">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#10b981]/10 mb-3">
              <Zap className="h-6 w-6 text-[#10b981]" />
            </div>
            <h2 className="text-base font-semibold text-foreground">Crear automatización</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Dale un nombre y descripción para identificarla fácilmente
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs">Nombre *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Bienvenida a nuevos leads"
              className="h-9 text-sm"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-xs">Descripción</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="¿Qué hace esta automatización?"
              className="text-sm resize-none"
              rows={3}
            />
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-9 text-sm"
              onClick={() => router.push("/automations")}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 h-9 text-sm gap-1.5"
              disabled={isPending || !name.trim()}
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Crear y editar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
