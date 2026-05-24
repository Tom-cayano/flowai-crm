"use client";

import { useState } from "react";
import { UserPlus, Trash2, ChevronDown, Mail, Loader2, Shield } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, getInitials } from "@/lib/utils";
import { getRoleLabel, getRoleColor } from "@/lib/rbac/roles";
import { UpgradeModal } from "@/components/billing/upgrade-modal";
import type { WorkspaceMember, WorkspaceInvitation, WorkspaceRole } from "@/types/workspace";

interface TeamPageClientProps {
  workspaceId:   string;
  currentUserId: string;
  members:       WorkspaceMember[];
  invitations:   WorkspaceInvitation[];
}

const ROLES: WorkspaceRole[] = ["owner", "admin", "manager", "agent"];

export function TeamPageClient({
  workspaceId,
  currentUserId,
  members: initialMembers,
  invitations: initialInvitations,
}: TeamPageClientProps) {
  const [members, setMembers]           = useState(initialMembers);
  const [invitations, setInvitations]   = useState(initialInvitations);
  const [showInvite, setShowInvite]     = useState(false);
  const [email, setEmail]               = useState("");
  const [role, setRole]                 = useState<WorkspaceRole>("agent");
  const [inviting, setInviting]         = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [seatLimit, setSeatLimit]       = useState<{ open: boolean; current?: number; limit?: number }>({ open: false });

  const handleInvite = async () => {
    if (!email.trim()) return;
    setInviting(true);
    setError(null);
    try {
      const res  = await fetch("/api/workspace/invite", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ workspaceId, email: email.trim(), role }),
      });
      const data = await res.json() as {
        invitation?: WorkspaceInvitation;
        error?:      string;
        code?:       string;
        current?:    number;
        limit?:      number;
      };
      if (!res.ok) {
        if (data.code === "SEAT_LIMIT_REACHED") {
          setSeatLimit({ open: true, current: data.current, limit: data.limit });
          setShowInvite(false);
        } else {
          setError(data.error ?? "Error al enviar invitación");
        }
        return;
      }
      if (data.invitation) {
        setInvitations((prev) => [data.invitation!, ...prev]);
        setEmail("");
        setShowInvite(false);
      }
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: WorkspaceRole) => {
    await fetch("/api/workspace/members", {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ workspaceId, userId, role: newRole }),
    });
    setMembers((prev) => prev.map((m) => m.userId === userId ? { ...m, role: newRole } : m));
  };

  const handleRemove = async (userId: string) => {
    await fetch("/api/workspace/members", {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ workspaceId, userId }),
    });
    setMembers((prev) => prev.filter((m) => m.userId !== userId));
  };

  const handleCancelInvite = async (invitationId: string) => {
    await fetch("/api/workspace/invite", {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ invitationId, workspaceId }),
    });
    setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Equipo</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestiona los miembros y permisos de tu workspace.
          </p>
        </div>
        <Button
          size="sm"
          className="text-[#030712] font-semibold"
          style={{ backgroundColor: "var(--brand)" }}
          onClick={() => setShowInvite((v) => !v)}
        >
          <UserPlus className="h-3.5 w-3.5 mr-1.5" />
          Invitar miembro
        </Button>
      </div>

      {/* Invite form */}
      <AnimatePresence>
        {showInvite && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 rounded-2xl border border-border bg-card space-y-3">
              <p className="text-sm font-medium text-foreground">Invitar nuevo miembro</p>
              {error && (
                <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>
              )}
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="correo@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                  className="flex-1 h-9 px-3 text-sm rounded-lg border border-border bg-muted focus:outline-none focus:ring-2 text-foreground placeholder:text-muted-foreground"
                  style={{ "--tw-ring-color": "color-mix(in srgb, var(--brand) 40%, transparent)" } as React.CSSProperties}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1 min-w-[110px]">
                      {getRoleLabel(role)}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {ROLES.filter((r) => r !== "owner").map((r) => (
                      <DropdownMenuItem key={r} onClick={() => setRole(r)} className="text-xs">
                        <Shield className="mr-2 h-3.5 w-3.5" />
                        {getRoleLabel(r)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  size="sm"
                  onClick={handleInvite}
                  disabled={inviting || !email.trim()}
                  className="text-[#030712] font-semibold"
                  style={{ backgroundColor: "var(--brand)" }}
                >
                  {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Invitar"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Members list */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Miembros activos ({members.length})
        </p>
        {members.map((member) => (
          <div
            key={member.id}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:bg-accent/30 transition-colors"
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">
                {getInitials(member.displayName ?? member.email ?? "?")}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {member.displayName ?? member.email ?? "Usuario"}
              </p>
              {member.email && member.displayName && (
                <p className="text-xs text-muted-foreground truncate">{member.email}</p>
              )}
            </div>
            <Badge variant="outline" className={cn("text-[10px] h-5 px-2", getRoleColor(member.role))}>
              {getRoleLabel(member.role)}
            </Badge>
            {member.userId !== currentUserId && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {ROLES.filter((r) => r !== "owner" && r !== member.role).map((r) => (
                    <DropdownMenuItem
                      key={r}
                      onClick={() => handleRoleChange(member.userId, r)}
                      className="text-xs"
                    >
                      Cambiar a {getRoleLabel(r)}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem
                    onClick={() => handleRemove(member.userId)}
                    className="text-xs text-red-400 focus:text-red-400"
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Eliminar del equipo
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        ))}
      </div>

      {/* Seat limit upgrade modal */}
      <UpgradeModal
        open={seatLimit.open}
        onClose={() => setSeatLimit({ open: false })}
        kind="seats"
        current={seatLimit.current}
        limit={seatLimit.limit}
        workspaceId={workspaceId}
      />

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Invitaciones pendientes ({invitations.length})
          </p>
          {invitations.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-border bg-card/50"
            >
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{inv.email}</p>
                <p className="text-[11px] text-muted-foreground">
                  Expira {new Date(inv.expiresAt).toLocaleDateString("es")}
                </p>
              </div>
              <Badge variant="outline" className={cn("text-[10px] h-5 px-2", getRoleColor(inv.role))}>
                {getRoleLabel(inv.role)}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-red-400"
                onClick={() => handleCancelInvite(inv.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
