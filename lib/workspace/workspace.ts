// Workspace CRUD, membership, and invitation management.

import { createAdminClient } from "@/lib/supabase/admin";
import { syncSeatCount } from "@/lib/billing/usage";
import type { Workspace, WorkspaceMember, WorkspaceInvitation, WorkspaceRole } from "@/types/workspace";
import type { Database } from "@/types/supabase";

type WorkspaceUpdate = Database["public"]["Tables"]["workspaces"]["Update"];

// ─── Get workspaces for a user ────────────────────────────────

export async function getUserWorkspaces(userId: string): Promise<Workspace[]> {
  const db = createAdminClient();

  // Workspaces where user is owner
  const { data: owned } = await db
    .from("workspaces")
    .select("*")
    .eq("owner_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  const ownedIds = new Set((owned ?? []).map((w) => w.id));

  // Workspaces where user is a member (separate query to avoid join type errors)
  const { data: memberRows } = await db
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .eq("is_active", true);

  const memberIds = (memberRows ?? [])
    .map((r) => r.workspace_id)
    .filter((id) => !ownedIds.has(id));

  const memberWorkspaces =
    memberIds.length > 0
      ? (await db.from("workspaces").select("*").in("id", memberIds).eq("is_active", true)).data ?? []
      : [];

  return [...(owned ?? []), ...memberWorkspaces].map(toWorkspace);
}

// ─── Create workspace ─────────────────────────────────────────

export async function createWorkspace(opts: {
  ownerId:   string;
  name:      string;
  parentId?: string;
}): Promise<Workspace> {
  const db   = createAdminClient();
  const slug = await generateUniqueSlug(opts.name);

  const { data, error } = await db
    .from("workspaces")
    .insert({
      owner_id:  opts.ownerId,
      parent_id: opts.parentId ?? null,
      name:      opts.name,
      slug,
      plan_id:   "starter",
      trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to create workspace: ${error?.message}`);

  // Seed onboarding progress
  await db.from("onboarding_progress").insert({ workspace_id: data.id });
  // Seed health record
  await db.from("workspace_health").insert({ workspace_id: data.id });
  // Add owner as member
  await db.from("workspace_members").insert({
    workspace_id: data.id,
    user_id:      opts.ownerId,
    role:         "owner",
  });

  return toWorkspace(data);
}

// ─── Get workspace members ─────────────────────────────────────

export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("workspace_members")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("joined_at", { ascending: true });

  return (data ?? []).map((m) => ({
    id:          m.id,
    workspaceId: m.workspace_id,
    userId:      m.user_id,
    role:        m.role as WorkspaceRole,
    permissions: m.permissions as Record<string, boolean> | null,
    displayName: m.display_name,
    avatarUrl:   m.avatar_url,
    isActive:    m.is_active,
    lastSeenAt:  m.last_seen_at,
    invitedBy:   m.invited_by,
    joinedAt:    m.joined_at,
  }));
}

// ─── Create invitation ────────────────────────────────────────

export async function createInvitation(opts: {
  workspaceId: string;
  email:       string;
  role:        WorkspaceRole;
  invitedBy:   string;
}): Promise<WorkspaceInvitation> {
  const db = createAdminClient();

  const { data, error } = await db
    .from("workspace_invitations")
    .upsert({
      workspace_id: opts.workspaceId,
      email:        opts.email.toLowerCase(),
      role:         opts.role,
      invited_by:   opts.invitedBy,
      expires_at:   new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      accepted_at:  null,
    }, { onConflict: "workspace_id,email" })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to create invitation: ${error?.message}`);

  return {
    id:          data.id,
    workspaceId: data.workspace_id,
    email:       data.email,
    role:        data.role as WorkspaceRole,
    token:       data.token,
    invitedBy:   data.invited_by,
    acceptedAt:  data.accepted_at,
    expiresAt:   data.expires_at,
    createdAt:   data.created_at,
  };
}

// ─── Accept invitation ────────────────────────────────────────

export async function acceptInvitation(token: string, userId: string): Promise<string | null> {
  const db = createAdminClient();

  const { data: inv } = await db
    .from("workspace_invitations")
    .select("*")
    .eq("token", token)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (!inv) return null;

  // Add as workspace member
  await db.from("workspace_members").upsert({
    workspace_id: inv.workspace_id,
    user_id:      userId,
    role:         inv.role,
    invited_by:   inv.invited_by,
  }, { onConflict: "workspace_id,user_id" });

  // Mark invitation accepted
  await db
    .from("workspace_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", inv.id);

  await syncSeatCount(inv.workspace_id);

  return inv.workspace_id;
}

// ─── Remove member ────────────────────────────────────────────

export async function removeMember(workspaceId: string, userId: string): Promise<void> {
  const db = createAdminClient();
  await db
    .from("workspace_members")
    .update({ is_active: false })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);

  await syncSeatCount(workspaceId);
}

// ─── Update member role ───────────────────────────────────────

export async function updateMemberRole(
  workspaceId: string,
  userId:      string,
  role:        WorkspaceRole
): Promise<void> {
  const db = createAdminClient();
  await db
    .from("workspace_members")
    .update({ role })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
}

// ─── Update workspace branding ────────────────────────────────

export async function updateWorkspaceBranding(
  workspaceId: string,
  opts: {
    name?:          string;
    logoUrl?:       string | null;
    primaryColor?:  string;
    companyName?:   string | null;
    supportEmail?:  string | null;
  }
): Promise<void> {
  const db     = createAdminClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (opts.name          !== undefined) update.name           = opts.name;
  if (opts.logoUrl       !== undefined) update.logo_url       = opts.logoUrl;
  if (opts.primaryColor  !== undefined) update.primary_color  = opts.primaryColor;
  if (opts.companyName   !== undefined) update.company_name   = opts.companyName;
  if (opts.supportEmail  !== undefined) update.support_email  = opts.supportEmail;

  await db.from("workspaces").update(update as unknown as WorkspaceUpdate).eq("id", workspaceId);
}

// ─── Helpers ──────────────────────────────────────────────────

async function generateUniqueSlug(name: string): Promise<string> {
  const db   = createAdminClient();
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  let   slug = base;
  let   n    = 1;

  while (true) {
    const { data } = await db.from("workspaces").select("id").eq("slug", slug).single();
    if (!data) return slug;
    slug = `${base}-${n++}`;
  }
}

function toWorkspace(row: Record<string, unknown>): Workspace {
  return {
    id:                   row.id as string,
    ownerId:              row.owner_id as string,
    parentId:             (row.parent_id as string | null) ?? null,
    name:                 row.name as string,
    slug:                 row.slug as string,
    planId:               row.plan_id as string,
    isAgency:             Boolean(row.is_agency),
    stripeCustomerId:     (row.stripe_customer_id as string | null) ?? null,
    stripeSubscriptionId: (row.stripe_subscription_id as string | null) ?? null,
    subscriptionStatus:   (row.subscription_status as string) ?? "trialing",
    trialEndsAt:          (row.trial_ends_at as string | null) ?? null,
    currentPeriodEnd:     (row.current_period_end as string | null) ?? null,
    billingInterval:      (row.billing_interval as string) ?? "monthly",
    logoUrl:              (row.logo_url as string | null) ?? null,
    primaryColor:         (row.primary_color as string) ?? "#10b981",
    companyName:          (row.company_name as string | null) ?? null,
    customDomain:         (row.custom_domain as string | null) ?? null,
    supportEmail:         (row.support_email as string | null) ?? null,
    timezone:             (row.timezone as string) ?? "America/Sao_Paulo",
    locale:               (row.locale as string) ?? "pt-BR",
    isActive:             Boolean(row.is_active),
    createdAt:            row.created_at as string,
    updatedAt:            row.updated_at as string,
  };
}
