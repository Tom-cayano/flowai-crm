"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Megaphone,
  Zap,
  Settings,
  ChevronLeft,
  ChevronRight,
  Smartphone,
  Activity,
  Store,
  CreditCard,
  UserCog,
} from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LogoMark, Logo } from "@/components/ui/logo";
import { SignOutButton } from "@/components/auth/sign-out-button";
import type { SessionUser, WorkspaceBranding } from "@/types";

const navItems = [
  { href: "/dashboard",    label: "Panel",            icon: LayoutDashboard },
  { href: "/conversations",label: "Conversaciones",   icon: MessageSquare, badge: 4 },
  { href: "/contacts",     label: "Contactos",        icon: Users },
  { href: "/whatsapp",     label: "WhatsApp",         icon: Smartphone },
  { href: "/campaigns",    label: "Campañas",         icon: Megaphone },
  { href: "/automations",  label: "Automatizaciones", icon: Zap },
  { href: "/marketplace",  label: "Marketplace",      icon: Store },
  { href: "/ops",          label: "Operaciones",      icon: Activity },
];

const bottomItems = [
  { href: "/settings/team",        label: "Equipo",          icon: UserCog },
  { href: "/settings/billing",     label: "Facturación",     icon: CreditCard },
  { href: "/settings/white-label", label: "White Label",     icon: Settings },
  { href: "/settings",             label: "Configuración",   icon: Settings },
];

interface SidebarProps {
  collapsed:  boolean;
  onToggle:   () => void;
  user:       SessionUser;
  workspace:  WorkspaceBranding | null;
}

// Renders the workspace logo mark or falls back to the default FlowAI logo.
function WorkspaceLogo({
  workspace,
  collapsed,
}: {
  workspace: WorkspaceBranding | null;
  collapsed: boolean;
}) {
  const color = workspace?.primaryColor ?? "#10b981";

  if (workspace?.logoUrl) {
    return collapsed ? (
      <div className="h-7 w-7 rounded-lg overflow-hidden shrink-0 ring-1 ring-white/10">
        <Image
          src={workspace.logoUrl}
          alt={workspace.companyName ?? workspace.name}
          width={28}
          height={28}
          className="object-contain w-full h-full"
          unoptimized={workspace.logoUrl.endsWith(".svg")}
        />
      </div>
    ) : (
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="h-7 w-7 rounded-lg overflow-hidden shrink-0 ring-1 ring-white/10">
          <Image
            src={workspace.logoUrl}
            alt={workspace.companyName ?? workspace.name}
            width={28}
            height={28}
            className="object-contain w-full h-full"
            unoptimized={workspace.logoUrl.endsWith(".svg")}
          />
        </div>
        <span className="text-[13px] font-semibold text-sidebar-foreground truncate">
          {workspace.companyName ?? workspace.name}
        </span>
      </div>
    );
  }

  // Custom color but no logo — show initials mark
  const label = workspace?.companyName ?? workspace?.name;
  if (label) {
    return collapsed ? (
      <div
        className="h-7 w-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0"
        style={{ backgroundColor: color }}
      >
        {label.slice(0, 2).toUpperCase()}
      </div>
    ) : (
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className="h-7 w-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0"
          style={{ backgroundColor: color }}
        >
          {label.slice(0, 2).toUpperCase()}
        </div>
        <span className="text-[13px] font-semibold text-sidebar-foreground truncate">
          {label}
        </span>
      </div>
    );
  }

  // Default FlowAI branding
  return collapsed ? <LogoMark size={26} /> : <Logo size={26} />;
}

export function Sidebar({ collapsed, onToggle, user, workspace }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "relative flex flex-col h-full bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out",
        collapsed ? "w-[60px]" : "w-[220px]"
      )}
    >
      {/* Logo / workspace identity */}
      <div
        className={cn(
          "flex items-center h-14 px-4 border-b border-sidebar-border shrink-0",
          collapsed && "justify-center px-0"
        )}
      >
        <WorkspaceLogo workspace={workspace} collapsed={collapsed} />
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-[52px] z-10 h-6 w-6 rounded-full border border-sidebar-border bg-sidebar text-muted-foreground hover:text-foreground shadow-sm flex items-center justify-center transition-colors duration-150"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </button>

      {/* Main nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "group flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 relative",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:text-sidebar-foreground hover:bg-white/[0.04]",
                collapsed && "justify-center"
              )}
            >
              <item.icon
                className={cn(
                  "shrink-0 transition-colors",
                  collapsed ? "h-[18px] w-[18px]" : "h-4 w-4"
                )}
                style={active ? { color: "var(--brand)" } : undefined}
              />
              {!collapsed && (
                <span className="flex-1 truncate leading-none">{item.label}</span>
              )}
              {!collapsed && item.badge && (
                <Badge
                  variant="default"
                  className="h-4 min-w-[18px] px-1 text-[9px] font-bold text-[#030712]"
                  style={{ backgroundColor: "var(--brand)" }}
                >
                  {item.badge}
                </Badge>
              )}
              {collapsed && item.badge && (
                <span
                  className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: "var(--brand)" }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="py-3 px-2 space-y-0.5 border-t border-sidebar-border">
        {bottomItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          // Avoid /settings matching /settings/team etc as "active" for the plain Settings item
          const isActive = item.href === "/settings"
            ? pathname === "/settings"
            : active;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:text-sidebar-foreground hover:bg-white/[0.04]",
                collapsed && "justify-center"
              )}
            >
              <item.icon
                className={cn("shrink-0 h-4 w-4")}
                style={isActive ? { color: "var(--brand)" } : undefined}
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}

        {!collapsed && (
          <div className="px-0.5">
            <SignOutButton className="px-2.5 py-2 text-sm font-medium rounded-lg" />
          </div>
        )}

        {/* User profile chip */}
        <div
          className={cn(
            "flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg mt-1",
            collapsed && "justify-center"
          )}
        >
          <div className="relative shrink-0">
            <Avatar className="h-7 w-7 ring-1 ring-white/[0.08]">
              <AvatarFallback
                className="text-[10px] font-semibold"
                style={{
                  background: `linear-gradient(135deg, color-mix(in srgb, var(--brand) 15%, transparent), color-mix(in srgb, var(--cyan, #06b6d4) 15%, transparent))`,
                  color: "var(--brand)",
                }}
              >
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <span
              className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-[1.5px] ring-sidebar"
              style={{ backgroundColor: "var(--brand)" }}
            />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-sidebar-foreground truncate leading-tight">
                {user.name}
              </p>
              <p className="text-[10px] text-muted-foreground capitalize leading-tight mt-0.5">
                {user.role}
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
