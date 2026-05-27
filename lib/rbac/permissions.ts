// Server-side permission enforcement helpers.
// Use in API routes and Server Actions to guard privileged operations.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPermission } from "./roles";
import type { Permission, WorkspaceRole, WorkspaceMember } from "@/types/workspace";

export interface AuthContext {
  userId:      string;
  workspaceId: string;
  role:        WorkspaceRole;
  member:      WorkspaceMember;
}

// ─── Resolve caller's role in a workspace ─────────────────────

export async function getAuthContext(workspaceId: string): Promise<AuthContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const db = createAdminClient();
  const { data: member } = await db
    .from("workspace_members")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!member) {
    // Check if user is the workspace owner (owners always have access)
    const { data: ws } = await db
      .from("workspaces")
      .select("id, owner_id")
      .eq("id", workspaceId)
      .eq("owner_id", user.id)
      .single();

    if (!ws) return null;

    // Owner without a member row — treat as owner role
    return {
      userId:      user.id,
      workspaceId,
      role:        "owner",
      member: {
        id:          "",
        workspaceId,
        userId:      user.id,
        role:        "owner",
        permissions: null,
        displayName: null,
        avatarUrl:   null,
        isActive:    true,
        lastSeenAt:  null,
        invitedBy:   null,
        joinedAt:    new Date().toISOString(),
      },
    };
  }

  return {
    userId:      user.id,
    workspaceId,
    role:        member.role as WorkspaceRole,
    member:      {
      id:          member.id,
      workspaceId: member.workspace_id,
      userId:      member.user_id,
      role:        member.role as WorkspaceRole,
      permissions: member.permissions as Partial<Record<Permission, boolean>> | null,
      displayName: member.display_name,
      avatarUrl:   member.avatar_url,
      isActive:    member.is_active,
      lastSeenAt:  member.last_seen_at,
      invitedBy:   member.invited_by,
      joinedAt:    member.joined_at,
    },
  };
}

// ─── Guard: require permission or return 403-equivalent ───────

export async function requirePermission(
  workspaceId: string,
  permission:  Permission
): Promise<AuthContext> {
  const ctx = await getAuthContext(workspaceId);
  if (!ctx) throw new PermissionError("Unauthorized", 401);

  const allowed = hasPermission(ctx.role, permission, ctx.member.permissions);
  if (!allowed) throw new PermissionError(`Missing permission: ${permission}`, 403);

  return ctx;
}

// ─── Resolve user's primary workspace ─────────────────────────
//
// FIX: Antes solo buscaba workspaces donde el user es `owner_id`.
// Ahora también incluye workspaces donde es miembro activo.
// Orden de prioridad: owned first → member second (por antigüedad).

export async function getUserPrimaryWorkspace(userId: string): Promise<string | null> {
  const db = createAdminClient();

  // 1. Buscar workspace propio (owner) — máxima prioridad
  const { data: owned } = await db
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (owned?.id) return owned.id;

  // 2. Fallback: workspace donde el user es miembro activo (invitado)
  // Dos queries simples en lugar de join anotado para evitar errores de tipos
  // con el stub manual de supabase.ts (el generado por CLI los tendría automáticamente).
  const { data: memberships } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("joined_at", { ascending: true })
    .limit(10);

  if (!memberships || memberships.length === 0) return null;

  // Verificar que el workspace referenciado esté activo
  for (const m of memberships) {
    const { data: ws } = await db
      .from("workspaces")
      .select("id")
      .eq("id", m.workspace_id)
      .eq("is_active", true)
      .maybeSingle();
    if (ws?.id) return ws.id;
  }

  return null;
}

// ─── Update last_seen_at for a member ─────────────────────────

export async function touchMemberActivity(workspaceId: string, userId: string): Promise<void> {
  const db = createAdminClient();
  await db
    .from("workspace_members")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
}

// ─── PermissionError ──────────────────────────────────────────

export class PermissionError extends Error {
  constructor(message: string, public readonly status: 401 | 403) {
    super(message);
    this.name = "PermissionError";
  }
}
