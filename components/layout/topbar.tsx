"use client";

import { usePathname } from "next/navigation";
import { Bell, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getInitials } from "@/lib/utils";
import type { SessionUser, WorkspaceBranding } from "@/types";

const pageTitles: Record<string, { title: string; description: string }> = {
  "/dashboard":    { title: "Panel",            description: "Resumen de tu espacio de trabajo" },
  "/conversations":{ title: "Conversaciones",   description: "Gestiona todos tus chats" },
  "/contacts":     { title: "Contactos",        description: "Tu base de datos de contactos" },
  "/campaigns":    { title: "Campañas",         description: "Difusión y alcance de audiencias" },
  "/automations":  { title: "Automatizaciones", description: "Flujos de trabajo automatizados" },
  "/marketplace":  { title: "Marketplace",      description: "Plantillas y extensiones" },
  "/ops":          { title: "Operaciones",      description: "Salud del sistema y colas" },
  "/settings":     { title: "Configuración",    description: "Configura tu espacio de trabajo" },
};

const notifications = [
  { text: "Carlos Mendoza envió un mensaje",       time: "hace 2 min" },
  { text: "La campaña 'Q3 Outreach' alcanzó el 70%", time: "hace 15 min" },
  { text: "Nuevo contacto: Ana García",            time: "hace 1 h" },
];

interface TopbarProps {
  user:      SessionUser;
  workspace: WorkspaceBranding | null;
}

export function Topbar({ user, workspace }: TopbarProps) {
  const pathname = usePathname();

  // Match exact path or first segment (e.g. /settings/billing → /settings)
  const key = Object.keys(pageTitles).find(
    (k) => pathname === k || pathname.startsWith(k + "/")
  );
  const appName = workspace?.companyName ?? workspace?.name ?? "FlowAI CRM";
  const current = pageTitles[key ?? ""] ?? { title: appName, description: "" };

  return (
    <header className="flex items-center justify-between h-14 px-5 border-b border-border bg-card shrink-0">
      {/* Page title */}
      <div className="flex flex-col">
        <h1 className="text-[13px] font-semibold text-foreground leading-tight">
          {current.title}
        </h1>
        {current.description && (
          <p className="text-[11px] text-muted-foreground hidden sm:block leading-tight mt-0.5">
            {current.description}
          </p>
        )}
      </div>

      {/* Search */}
      <div className="flex-1 max-w-xs mx-6 hidden md:flex">
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            className="pl-8 h-8 text-[13px] bg-muted/50 border-border focus-visible:ring-1 focus-visible:ring-[var(--brand)] focus-visible:border-[var(--brand)]/50"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden lg:flex items-center gap-0.5 h-5 px-1.5 rounded border border-border bg-muted/30 text-[9px] text-muted-foreground font-mono">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <Bell className="h-4 w-4" />
              <span
                className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: "var(--brand)" }}
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72 bg-popover border-border">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span className="text-sm">Notificaciones</span>
              <Badge
                className="h-4 text-[9px] px-1.5 font-bold text-[#030712]"
                style={{ backgroundColor: "var(--brand)" }}
              >
                {notifications.length} nuevas
              </Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.map((n, i) => (
              <DropdownMenuItem
                key={i}
                className="flex-col items-start gap-0.5 py-2.5 cursor-pointer"
              >
                <span className="text-[13px] text-foreground leading-tight">{n.text}</span>
                <span className="text-[11px] text-muted-foreground">{n.time}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="justify-center text-[12px] py-2"
              style={{ color: "var(--brand)" }}
            >
              Ver todas las notificaciones
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* New action */}
        <Button
          size="sm"
          className="h-8 gap-1.5 text-[13px] ml-1 font-semibold text-[#030712] hover:opacity-90"
          style={{ backgroundColor: "var(--brand)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Nuevo</span>
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 ml-1 rounded-full hover:bg-accent"
            >
              <Avatar className="h-7 w-7 ring-1 ring-white/[0.08]">
                <AvatarFallback
                  className="text-[11px] font-semibold"
                  style={{ color: "var(--brand)" }}
                >
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 bg-popover border-border">
            <DropdownMenuLabel className="pb-2">
              <p className="text-[13px] font-semibold text-foreground truncate">{user.name}</p>
              <p className="text-[11px] text-muted-foreground font-normal truncate mt-0.5">
                {user.email}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-[13px]">Perfil</DropdownMenuItem>
            <DropdownMenuItem className="text-[13px]">Facturación</DropdownMenuItem>
            <DropdownMenuSeparator />
            <SignOutButton />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
