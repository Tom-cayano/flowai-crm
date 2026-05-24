"use client";

import { useState, useEffect } from "react";
import {
  Phone,
  Mail,
  Building2,
  MapPin,
  MessageCircle,
  StickyNote,
  Tag,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { TagInput } from "./tag-input";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/utils";
import type { Contact, ContactStatus } from "@/types";
import type { ContactFormData } from "@/lib/actions/contacts";

// ─── Status button group ──────────────────────────────────────────────────────

const STATUS_OPTIONS: {
  value: ContactStatus;
  label: string;
  active: string;
  dot: string;
}[] = [
  {
    value: "active",
    label: "Activo",
    active: "bg-emerald-500/15 border-emerald-500/40 text-emerald-400",
    dot: "bg-emerald-400",
  },
  {
    value: "inactive",
    label: "Inactivo",
    active: "bg-amber-500/15 border-amber-500/40 text-amber-400",
    dot: "bg-amber-400",
  },
  {
    value: "blocked",
    label: "Bloqueado",
    active: "bg-red-500/15 border-red-500/40 text-red-400",
    dot: "bg-red-400",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FormField({
  label,
  icon: Icon,
  children,
  className,
}: {
  label: string;
  icon?: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-[11px] text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide font-medium">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </Label>
      {children}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ContactModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: ContactFormData) => Promise<void>;
  contact?: Contact | null;
}

export function ContactModal({
  open,
  onClose,
  onSubmit,
  contact,
}: ContactModalProps) {
  const isEdit = !!contact;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<ContactStatus>("active");
  const [tags, setTags] = useState<string[]>([]);

  // Populate form when editing or reset when adding.
  useEffect(() => {
    if (open) {
      if (contact) {
        setName(contact.name);
        setPhone(contact.phone ?? "");
        setWhatsapp(contact.whatsapp ?? "");
        setEmail(contact.email ?? "");
        setInstagram(contact.instagram ?? "");
        setCompany(contact.company ?? "");
        setLocation(contact.location ?? "");
        setNotes(contact.notes ?? "");
        setStatus(contact.status);
        setTags(contact.tags);
      } else {
        setName("");
        setPhone("");
        setWhatsapp("");
        setEmail("");
        setInstagram("");
        setCompany("");
        setLocation("");
        setNotes("");
        setStatus("active");
        setTags([]);
      }
      setError(null);
    }
  }, [open, contact]);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name,
        phone,
        whatsapp,
        email,
        instagram,
        company,
        location,
        notes,
        status,
        tags,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ha ocurrido un error");
    } finally {
      setSubmitting(false);
    }
  }

  const initials = name.trim()
    ? getInitials(name)
    : "?";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0">
        {/* ── Header ── */}
        <DialogHeader className="flex-row items-center gap-4">
          <div
            className="h-12 w-12 rounded-xl shrink-0 flex items-center justify-center text-sm font-bold text-[#030712]"
            style={{ background: "linear-gradient(135deg, #10b981, #06b6d4)" }}
            aria-hidden
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle>
              {isEdit ? "Editar contacto" : "Nuevo contacto"}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Actualiza la información del contacto."
                : "Rellena los datos para añadir un nuevo contacto."}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* ── Body ── */}
        <form
          id="contact-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-6 py-5 space-y-5"
        >
          {/* Status toggle */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">
              Estado
            </Label>
            <div className="flex gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-xs font-medium transition-all duration-150",
                    status === opt.value
                      ? opt.active
                      : "border-border text-muted-foreground hover:border-border/60 hover:text-foreground/80"
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      status === opt.value ? opt.dot : "bg-muted-foreground/40"
                    )}
                  />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Name — full width, prominent */}
          <FormField label="Nombre *">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre completo"
              className="h-9 text-sm"
              autoFocus
            />
          </FormField>

          {/* Contact info — 2-column grid */}
          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label="Teléfono" icon={Phone}>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+34 600 000 000"
                type="tel"
                className="h-9 text-sm"
              />
            </FormField>

            <FormField label="WhatsApp" icon={MessageCircle}>
              <div className="relative">
                <MessageCircle className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-emerald-400 pointer-events-none" />
                <Input
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="+34 600 000 000"
                  type="tel"
                  className="h-9 text-sm pl-8"
                />
              </div>
            </FormField>

            <FormField label="Email" icon={Mail}>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@ejemplo.com"
                type="email"
                className="h-9 text-sm"
              />
            </FormField>

            <FormField label="Instagram">

              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                  @
                </span>
                <Input
                  value={instagram.replace(/^@/, "")}
                  onChange={(e) => setInstagram(e.target.value.replace(/^@/, ""))}
                  placeholder="usuario"
                  className="h-9 text-sm pl-6"
                />
              </div>
            </FormField>

            <FormField label="Empresa" icon={Building2}>
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Nombre de empresa"
                className="h-9 text-sm"
              />
            </FormField>

            <FormField label="Ubicación" icon={MapPin}>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Madrid, España"
                className="h-9 text-sm"
              />
            </FormField>
          </div>

          {/* Tags */}
          <FormField label="Etiquetas" icon={Tag}>
            <TagInput
              tags={tags}
              onChange={setTags}
              placeholder="Escribe y presiona Enter para añadir..."
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Presiona Enter o coma para añadir. Máx. 10 etiquetas.
            </p>
          </FormField>

          {/* Notes */}
          <FormField label="Notas" icon={StickyNote}>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Información adicional sobre este contacto..."
              className="min-h-[72px] resize-none text-sm"
            />
          </FormField>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </form>

        {/* ── Footer ── */}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={submitting}
            className="h-8 text-xs"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="contact-form"
            size="sm"
            disabled={submitting || !name.trim()}
            className="h-8 text-xs bg-[#10b981] hover:bg-[#0ea572] text-[#030712] font-semibold gap-1.5"
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isEdit ? "Guardar cambios" : "Añadir contacto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
