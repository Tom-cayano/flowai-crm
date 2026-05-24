"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  Search,
  UserPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
  MessageCircle,
  Phone,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ContactModal } from "./contact-modal";
import { chipColor } from "./tag-input";
import { createContact, updateContact, deleteContact } from "@/lib/actions/contacts";
import { getInitials, formatDate, formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Contact, ContactStatus } from "@/types";
import type { ContactFormData } from "@/lib/actions/contacts";

// ─── Status config ────────────────────────────────────────────────────────────

type StatusConfig = { label: string; dot: string; text: string };

const STATUS_FALLBACK: StatusConfig = {
  dot: "bg-zinc-500",
  text: "text-zinc-400",
  label: "Desconocido",
};

const STATUS_CONFIG: Record<ContactStatus, StatusConfig> = {
  active:   { label: "Activo",    dot: "bg-emerald-400", text: "text-emerald-400" },
  inactive: { label: "Inactivo",  dot: "bg-amber-400",   text: "text-amber-400"   },
  blocked:  { label: "Bloqueado", dot: "bg-red-400",     text: "text-red-400"     },
};

function getStatusConfig(status: string | null | undefined): StatusConfig {
  if (!status) return STATUS_FALLBACK;
  return (STATUS_CONFIG as Record<string, StatusConfig | undefined>)[status] ?? STATUS_FALLBACK;
}

const FILTER_LABELS: Record<ContactStatus | "all", string> = {
  all:      "Todos",
  active:   "Activos",
  inactive: "Inactivos",
  blocked:  "Bloqueados",
};

// ─── Avatar gradient (deterministic per name) ─────────────────────────────────

const AVATAR_GRADIENTS = [
  "from-[#10b981] to-[#06b6d4]",
  "from-[#8b5cf6] to-[#06b6d4]",
  "from-[#f59e0b] to-[#10b981]",
  "from-[#ec4899] to-[#8b5cf6]",
  "from-[#06b6d4] to-[#3b82f6]",
];

function avatarGradient(name: string): string {
  let h = 0;
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ContactsShellProps {
  initialContacts: Contact[];
}

export function ContactsShell({ initialContacts }: ContactsShellProps) {
  // Sync local state with server state (after revalidatePath re-renders the page).
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const prevInitialRef = useRef(initialContacts);
  useEffect(() => {
    if (prevInitialRef.current !== initialContacts) {
      prevInitialRef.current = initialContacts;
      setContacts(initialContacts);
    }
  }, [initialContacts]);

  // ── Filters ──
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContactStatus | "all">("all");

  // ── Modal ──
  const [modalOpen, setModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  // ── Filtered view ──
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return contacts.filter((c) => {
      const matchSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.phone?.includes(q) ?? false) ||
        (c.whatsapp?.includes(q) ?? false) ||
        (c.email?.toLowerCase().includes(q) ?? false) ||
        (c.company?.toLowerCase().includes(q) ?? false) ||
        (c.instagram?.toLowerCase().includes(q) ?? false) ||
        c.tags.some((t) => t.includes(q));
      const matchStatus = statusFilter === "all" || c.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [contacts, search, statusFilter]);

  const counts = useMemo(
    () => ({
      all:      contacts.length,
      active:   contacts.filter((c) => c.status === "active").length,
      inactive: contacts.filter((c) => c.status === "inactive").length,
      blocked:  contacts.filter((c) => c.status === "blocked").length,
    }),
    [contacts]
  );

  // ── CRUD handlers ──

  function openAdd() {
    setEditingContact(null);
    setModalOpen(true);
  }

  function openEdit(c: Contact) {
    setEditingContact(c);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingContact(null);
  }

  function buildOptimisticContact(
    data: ContactFormData,
    existing?: Contact | null
  ): Contact {
    return {
      id: existing?.id ?? `temp-${Date.now()}`,
      name: data.name,
      phone: data.phone ?? "",
      whatsapp: data.whatsapp || undefined,
      email: data.email || undefined,
      instagram: data.instagram || undefined,
      company: data.company || undefined,
      location: data.location || undefined,
      notes: data.notes || undefined,
      status: data.status,
      tags: data.tags,
      lastSeen: existing?.lastSeen ?? new Date().toISOString(),
      lastInteraction: data.lastInteraction ?? existing?.lastInteraction,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      totalMessages: existing?.totalMessages ?? 0,
    };
  }

  async function handleSubmit(data: ContactFormData): Promise<void> {
    if (editingContact) {
      // Optimistic update
      const optimistic = buildOptimisticContact(data, editingContact);
      setContacts((prev) =>
        prev.map((c) => (c.id === editingContact.id ? optimistic : c))
      );

      const result = await updateContact(editingContact.id, data);
      if (result.error) {
        // Revert to previous state
        setContacts((prev) =>
          prev.map((c) => (c.id === editingContact.id ? editingContact : c))
        );
        throw new Error(result.error);
      }
      // Replace temp with real data from server
      if (result.data) {
        setContacts((prev) =>
          prev.map((c) => (c.id === editingContact.id ? result.data! : c))
        );
      }
    } else {
      const tempId = `temp-${Date.now()}`;
      const optimistic = buildOptimisticContact(data);
      const optimisticWithId = { ...optimistic, id: tempId };

      setContacts((prev) => [optimisticWithId, ...prev]);

      const result = await createContact(data);
      if (result.error) {
        setContacts((prev) => prev.filter((c) => c.id !== tempId));
        throw new Error(result.error);
      }
      if (result.data) {
        setContacts((prev) =>
          prev.map((c) => (c.id === tempId ? result.data! : c))
        );
      }
    }
  }

  const deletedRef = useRef<Contact | null>(null);

  async function handleDelete(contact: Contact) {
    deletedRef.current = contact;
    setContacts((prev) => prev.filter((c) => c.id !== contact.id));

    const result = await deleteContact(contact.id);
    if (result.error) {
      // Re-insert at original position (approximate — prepend)
      if (deletedRef.current) {
        setContacts((prev) => [deletedRef.current!, ...prev]);
      }
      deletedRef.current = null;
    }
  }

  // ── Render ──

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Page header ── */}
      <div className="px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-base font-semibold text-foreground">Contactos</h1>
            <p className="text-xs text-muted-foreground">
              {counts.all} {counts.all === 1 ? "contacto" : "contactos"} en total
            </p>
          </div>
          <Button
            size="sm"
            onClick={openAdd}
            className="h-8 gap-1.5 text-xs bg-[#10b981] hover:bg-[#0ea572] text-[#030712] font-semibold shrink-0"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Añadir contacto
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-3 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, teléfono, empresa..."
            className="pl-8 h-8 text-xs bg-muted border-0"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-0 -mb-px">
          {(["all", "active", "inactive", "blocked"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap",
                statusFilter === s
                  ? "border-[#10b981] text-[#10b981]"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {FILTER_LABELS[s]}
              <span
                className={cn(
                  "ml-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded-md font-medium",
                  statusFilter === s
                    ? "bg-[#10b981]/15 text-[#10b981]"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {counts[s]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center bg-background">
          {search || statusFilter !== "all" ? (
            <EmptyState
              icon={Search}
              title="Sin resultados"
              description={
                search
                  ? `No se encontraron contactos con "${search}".`
                  : `No hay contactos ${FILTER_LABELS[statusFilter].toLowerCase()}.`
              }
            />
          ) : (
            <EmptyState
              icon={Users}
              title="Aún no tienes contactos"
              description="Añade tu primer contacto para empezar a gestionar tus clientes y leads."
              action={
                <Button
                  size="sm"
                  onClick={openAdd}
                  className="bg-[#10b981] hover:bg-[#0ea572] text-[#030712] font-semibold gap-1.5"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Añadir primer contacto
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <table className="w-full min-w-[760px]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border">
                {[
                  "Contacto",
                  "WhatsApp / Teléfono",
                  "Empresa",
                  "Etiquetas",
                  "Estado",
                  "Última interacción",
                  "Añadido",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 first:pl-6 last:pr-6 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((contact) => {
                const sc = getStatusConfig(contact.status);
                const gradient = avatarGradient(contact.name || "");
                const isTemp = contact.id.startsWith("temp-");

                return (
                  <tr
                    key={contact.id}
                    onClick={() => !isTemp && openEdit(contact)}
                    className={cn(
                      "border-b border-border/40 last:border-0 transition-colors group",
                      isTemp
                        ? "opacity-60 pointer-events-none"
                        : "hover:bg-accent/30 cursor-pointer"
                    )}
                  >
                    {/* Contact name + email */}
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={cn(
                            "h-8 w-8 rounded-full shrink-0 flex items-center justify-center",
                            "text-[11px] font-bold text-[#030712] bg-gradient-to-br",
                            gradient
                          )}
                        >
                          {getInitials(contact.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate max-w-[150px]">
                            {contact.name}
                          </p>
                          {contact.email ? (
                            <p className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                              {contact.email}
                            </p>
                          ) : contact.instagram ? (
                            <p className="text-[10px] text-muted-foreground/60 truncate max-w-[150px]">
                              @{contact.instagram}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>

                    {/* WhatsApp / Phone */}
                    <td className="px-4 py-3">
                      {contact.whatsapp ? (
                        <div className="flex items-center gap-1.5">
                          <MessageCircle className="h-3 w-3 text-emerald-400 shrink-0" />
                          <span className="text-xs text-muted-foreground">
                            {contact.whatsapp}
                          </span>
                        </div>
                      ) : contact.phone ? (
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                          <span className="text-xs text-muted-foreground/60">
                            {contact.phone}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/25">—</span>
                      )}
                    </td>

                    {/* Company */}
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground">
                        {contact.company ?? "—"}
                      </span>
                    </td>

                    {/* Tags */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {(contact.tags ?? []).slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className={cn(
                              "inline-flex items-center px-1.5 py-0.5 rounded-full",
                              "text-[10px] font-medium border",
                              chipColor(tag)
                            )}
                          >
                            {tag}
                          </span>
                        ))}
                        {(contact.tags ?? []).length > 2 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{(contact.tags ?? []).length - 2}
                          </span>
                        )}
                        {(contact.tags ?? []).length === 0 && (
                          <span className="text-xs text-muted-foreground/25">—</span>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn("h-1.5 w-1.5 rounded-full shrink-0", sc.dot)}
                        />
                        <span className={cn("text-xs", sc.text)}>{sc.label}</span>
                      </div>
                    </td>

                    {/* Last interaction */}
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground">
                        {contact.lastInteraction
                          ? formatTime(contact.lastInteraction)
                          : "—"}
                      </span>
                    </td>

                    {/* Since */}
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(contact.createdAt)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td
                      className="px-6 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-xs"
                            onClick={() => openEdit(contact)}
                          >
                            <Pencil className="mr-2 h-3.5 w-3.5" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-xs text-red-400 focus:text-red-400 focus:bg-red-500/10"
                            onClick={() => handleDelete(contact)}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      )}

      {/* ── Footer ── */}
      {filtered.length > 0 && (
        <div className="px-6 py-2.5 border-t border-border bg-card shrink-0">
          <p className="text-xs text-muted-foreground">
            Mostrando{" "}
            <span className="text-foreground font-medium">{filtered.length}</span>{" "}
            de{" "}
            <span className="text-foreground font-medium">{contacts.length}</span>{" "}
            contactos
          </p>
        </div>
      )}

      {/* ── Modal ── */}
      <ContactModal
        open={modalOpen}
        onClose={closeModal}
        onSubmit={handleSubmit}
        contact={editingContact}
      />
    </div>
  );
}
