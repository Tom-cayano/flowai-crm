// RBAC — role definitions and permission matrix.
// Single source of truth for what each role can do.

import type { WorkspaceRole, Permission } from "@/types/workspace";

// Full permission set for each role
const ROLE_PERMISSIONS: Record<WorkspaceRole, Permission[]> = {
  owner: [
    "conversations.view", "conversations.assign", "conversations.resolve", "conversations.delete",
    "automations.view", "automations.manage", "automations.execute",
    "contacts.view", "contacts.edit", "contacts.delete",
    "team.view", "team.invite", "team.manage",
    "billing.view", "billing.manage",
    "ai.use", "ai.configure",
    "analytics.view",
    "settings.workspace", "settings.integrations",
    "white_label", "templates.publish",
  ],
  admin: [
    "conversations.view", "conversations.assign", "conversations.resolve", "conversations.delete",
    "automations.view", "automations.manage", "automations.execute",
    "contacts.view", "contacts.edit", "contacts.delete",
    "team.view", "team.invite", "team.manage",
    "billing.view",
    "ai.use", "ai.configure",
    "analytics.view",
    "settings.integrations",
    "templates.publish",
  ],
  manager: [
    "conversations.view", "conversations.assign", "conversations.resolve",
    "automations.view", "automations.manage", "automations.execute",
    "contacts.view", "contacts.edit",
    "team.view",
    "ai.use",
    "analytics.view",
  ],
  agent: [
    "conversations.view", "conversations.resolve",
    "automations.view",
    "contacts.view",
    "ai.use",
  ],
};

// Check if a role inherently has a permission (ignoring overrides)
export function roleHasPermission(role: WorkspaceRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

// Check effective permission considering granular overrides
export function hasPermission(
  role:        WorkspaceRole,
  permission:  Permission,
  overrides?:  Partial<Record<Permission, boolean>> | null
): boolean {
  if (overrides && permission in overrides) {
    return overrides[permission] === true;
  }
  return roleHasPermission(role, permission);
}

// Role hierarchy — higher index = more privileged
const ROLE_ORDER: WorkspaceRole[] = ["agent", "manager", "admin", "owner"];

export function isRoleAtLeast(role: WorkspaceRole, minimum: WorkspaceRole): boolean {
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(minimum);
}

export function getRoleLabel(role: WorkspaceRole): string {
  return {
    owner:   "Propietario",
    admin:   "Administrador",
    manager: "Manager",
    agent:   "Agente",
  }[role];
}

export function getRoleColor(role: WorkspaceRole): string {
  return {
    owner:   "text-purple-400 bg-purple-400/10 border-purple-400/30",
    admin:   "text-blue-400 bg-blue-400/10 border-blue-400/30",
    manager: "text-amber-400 bg-amber-400/10 border-amber-400/30",
    agent:   "text-muted-foreground bg-muted border-border",
  }[role];
}

export { ROLE_PERMISSIONS };
