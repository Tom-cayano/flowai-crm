"use client";

import { X, Phone, Mail, MapPin, Building2, Tag, Clock, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { getInitials, formatDate, formatTime } from "@/lib/utils";
import type { Conversation } from "@/types";

interface ContactPanelProps {
  conversation: Conversation;
  onClose: () => void;
}

const contactStatusLabel = {
  active: "Activo",
  inactive: "Inactivo",
  blocked: "Bloqueado",
} as const;

export function ContactPanel({ conversation, onClose }: ContactPanelProps) {
  const { contact } = conversation;

  return (
    <div className="w-72 shrink-0 border-l border-border bg-card flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold">Info del contacto</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-5">
          {/* Profile */}
          <div className="flex flex-col items-center gap-2 pt-2">
            <div className="relative">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="text-xl">{getInitials(contact.name)}</AvatarFallback>
              </Avatar>
              {contact.status === "active" && (
                <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-card" />
              )}
            </div>
            <div className="text-center">
              <h4 className="text-sm font-semibold text-foreground">{contact.name}</h4>
              {contact.company && (
                <p className="text-xs text-muted-foreground">{contact.company}</p>
              )}
            </div>
            <div className="flex gap-1.5">
              {contact.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
              ))}
            </div>
            <Badge
              variant={contact.status === "active" ? "success" : contact.status === "inactive" ? "warning" : "destructive"}
              className="text-[10px]"
            >
              {contactStatusLabel[contact.status]}
            </Badge>
          </div>

          <Separator />

          {/* Details */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Detalles</p>
            {[
              { icon: Phone, label: contact.phone },
              ...(contact.email ? [{ icon: Mail, label: contact.email }] : []),
              ...(contact.location ? [{ icon: MapPin, label: contact.location }] : []),
              ...(contact.company ? [{ icon: Building2, label: contact.company }] : []),
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <item.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-foreground truncate">{item.label}</span>
              </div>
            ))}
          </div>

          <Separator />

          {/* Stats */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Interacción</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: MessageSquare, label: "Mensajes", value: contact.totalMessages },
                { icon: Clock, label: "Última vez", value: formatTime(contact.lastSeen) },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-muted p-2.5">
                  <s.icon className="h-3.5 w-3.5 text-muted-foreground mb-1" />
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  <p className="text-xs font-semibold text-foreground">{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Conversation tags */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Etiquetas de la conversación</p>
            <div className="flex flex-wrap gap-1.5">
              {conversation.tags.map((tag) => (
                <div key={tag} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
                  <Tag className="h-2.5 w-2.5 text-muted-foreground" />
                  <span className="text-[10px] text-foreground">{tag}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          {contact.notes && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Notas</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{contact.notes}</p>
              </div>
            </>
          )}

          {/* Member since */}
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Contacto desde</span>
            <span className="text-[10px] text-foreground font-medium">{formatDate(contact.createdAt)}</span>
          </div>
        </div>
      </ScrollArea>

      {/* Actions */}
      <div className="p-3 border-t border-border space-y-2">
        <Button variant="outline" size="sm" className="w-full text-xs h-8">
          Ver perfil completo
        </Button>
        <Button variant="ghost" size="sm" className="w-full text-xs h-8 text-destructive-foreground hover:bg-destructive/10">
          Bloquear contacto
        </Button>
      </div>
    </div>
  );
}
