"use client";

import { useState, useTransition } from "react";
import { Plus, Smartphone, Loader2, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createInstance } from "@/lib/actions/whatsapp-instances";
import { InstanceCard } from "./instance-card";
import type { WhatsAppInstance } from "@/lib/actions/whatsapp-instances";

// ─── Add-instance form ────────────────────────────────────────────────────────

interface AddFormProps {
  onCreated: (instance: WhatsAppInstance) => void;
  onCancel: () => void;
}

function AddInstanceForm({ onCreated, onCancel }: AddFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const label = (fd.get("label") as string).trim();

    startTransition(async () => {
      const result = await createInstance({ label });
      if (result.error) {
        setError(result.error);
        return;
      }
      onCreated(result.data!);
    });
  }

  return (
    <div className="rounded-xl border border-dashed border-[#10b981]/40 bg-[#10b981]/[0.03] p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-[#10b981]/10 flex items-center justify-center">
            <Smartphone className="h-3.5 w-3.5 text-[#10b981]" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Nueva instancia</h3>
        </div>
        <button
          onClick={onCancel}
          className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="label" className="text-xs">Nombre de la instancia</Label>
          <Input
            id="label"
            name="label"
            placeholder="Ej. Ventas Principal"
            required
            disabled={isPending}
            className="h-8 text-sm"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-400 leading-relaxed">{error}</p>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            type="submit"
            size="sm"
            disabled={isPending}
            className="flex-1 bg-[#10b981] hover:bg-[#0d9e6f] text-[#030712] font-semibold gap-1.5 text-xs"
          >
            {isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Creando…
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                Crear instancia
              </>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
            className="text-xs"
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-16 w-16 rounded-2xl bg-[#10b981]/10 flex items-center justify-center mb-4">
        <Smartphone className="h-8 w-8 text-[#10b981]" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">
        Sin instancias de WhatsApp
      </h3>
      <p className="text-xs text-muted-foreground max-w-xs leading-relaxed mb-5">
        Conecta tu primer número de WhatsApp para empezar a recibir y enviar mensajes desde el CRM.
      </p>
      <Button
        size="sm"
        onClick={onAdd}
        className="bg-[#10b981] hover:bg-[#0d9e6f] text-[#030712] font-semibold gap-1.5 text-xs"
      >
        <Plus className="h-3.5 w-3.5" />
        Agregar instancia
      </Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface InstanceManagerProps {
  initialInstances: WhatsAppInstance[];
}

export function InstanceManager({ initialInstances }: InstanceManagerProps) {
  const [instances, setInstances] = useState<WhatsAppInstance[]>(initialInstances);
  const [showForm, setShowForm] = useState(false);

  function handleCreated(instance: WhatsAppInstance) {
    setInstances((prev) => [instance, ...prev]);
    setShowForm(false);
  }

  function handleDeleted(id: string) {
    setInstances((prev) => prev.filter((i) => i.id !== id));
  }

  function handleStateChange(id: string, state: string) {
    setInstances((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, connection_state: state as WhatsAppInstance["connection_state"] }
          : i
      )
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Instancias de WhatsApp
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {instances.length === 0
              ? "Sin instancias configuradas"
              : `${instances.length} instancia${instances.length !== 1 ? "s" : ""} configurada${instances.length !== 1 ? "s" : ""}`}
          </p>
        </div>

        {!showForm && (
          <Button
            size="sm"
            onClick={() => setShowForm(true)}
            className={cn(
              "gap-1.5 text-xs font-semibold",
              "bg-[#10b981] hover:bg-[#0d9e6f] text-[#030712]"
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar
          </Button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <AddInstanceForm
          onCreated={handleCreated}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Grid */}
      {instances.length === 0 && !showForm ? (
        <EmptyState onAdd={() => setShowForm(true)} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {instances.map((instance) => (
            <InstanceCard
              key={instance.id}
              instance={instance}
              onDeleted={handleDeleted}
              onStateChange={handleStateChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
