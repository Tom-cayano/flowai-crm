"use client";

import { useState, useTransition } from "react";
import { MessageSquarePlus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import { createConversation } from "@/lib/actions/conversations";
import type { Conversation } from "@/types";

interface Props {
  open:        boolean;
  onClose:     () => void;
  onCreated:   (conv: Conversation) => void;
}

export function NewConversationDialog({ open, onClose, onCreated }: Props) {
  const [name,    setName]    = useState("");
  const [phone,   setPhone]   = useState("");
  const [channel, setChannel] = useState<"whatsapp" | "sms">("whatsapp");
  const [error,   setError]   = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName(""); setPhone(""); setChannel("whatsapp"); setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("El nombre es obligatorio"); return; }

    setError(null);
    startTransition(async () => {
      const result = await createConversation({
        contactName:  name.trim(),
        contactPhone: phone.trim() || undefined,
        channel,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onCreated(result.data!);
      handleClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-4 w-4 text-[#10b981]" />
            Nueva conversación
          </DialogTitle>
          <DialogDescription>
            Crea una conversación manualmente para iniciar contacto.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Nombre del contacto <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="Ej. Juan Pérez"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={pending}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Teléfono <span className="text-[10px] text-muted-foreground/60">(con código de país, sin +)</span>
              </label>
              <Input
                placeholder="5511999999999"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                disabled={pending}
                inputMode="numeric"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Canal</label>
              <div className="flex gap-2">
                {(["whatsapp", "sms"] as const).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setChannel(ch)}
                    disabled={pending}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      channel === ch
                        ? "border-[#10b981] bg-[#10b981]/10 text-[#10b981]"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {ch === "whatsapp" ? "WhatsApp" : "SMS"}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={handleClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={pending || !name.trim()}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Crear conversación
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
