// Template marketplace — list, install, and rate workflow/prompt/campaign templates.

import { createAdminClient } from "@/lib/supabase/admin";
import type { Template, TemplateType } from "@/types/workspace";
import type { Json } from "@/types/supabase";

// ─── List public templates ─────────────────────────────────────

export async function listTemplates(opts: {
  type?:      TemplateType;
  category?:  string;
  featured?:  boolean;
  limit?:     number;
}): Promise<Template[]> {
  const db = createAdminClient();
  let query = db
    .from("templates")
    .select("*")
    .eq("is_public", true)
    .order("is_featured", { ascending: false })
    .order("install_count", { ascending: false })
    .limit(opts.limit ?? 50);

  if (opts.type)     query = query.eq("type", opts.type);
  if (opts.category) query = query.eq("category", opts.category);
  if (opts.featured) query = query.eq("is_featured", true);

  const { data } = await query;
  return (data ?? []).map(toTemplate);
}

// ─── Get single template ──────────────────────────────────────

export async function getTemplate(id: string): Promise<Template | null> {
  const db = createAdminClient();
  const { data } = await db.from("templates").select("*").eq("id", id).single();
  return data ? toTemplate(data) : null;
}

// ─── Install template into workspace ──────────────────────────

export async function installTemplate(opts: {
  templateId:  string;
  workspaceId: string;
  installedBy: string;
}): Promise<{ automationId?: string; error?: string }> {
  const db = createAdminClient();
  const template = await getTemplate(opts.templateId);
  if (!template) return { error: "Template not found" };

  // Record install (idempotent)
  await db
    .from("template_installs")
    .upsert({
      template_id:  opts.templateId,
      workspace_id: opts.workspaceId,
      installed_by: opts.installedBy,
    }, { onConflict: "template_id,workspace_id" });

  // Increment install count
  await db.rpc("increment_usage", {
    p_workspace_id: opts.workspaceId,
    p_field:        "automations_executed",
    p_amount:       0,
  });
  await db
    .from("templates")
    .update({ install_count: template.installCount + 1 })
    .eq("id", opts.templateId);

  // If it's a workflow template, create an automation
  if (template.type === "workflow" && template.content) {
    const { data: automation } = await db
      .from("automations")
      .insert({
        user_id:     opts.workspaceId, // Mapped to current user in practice
        name:        `${template.name} (instalado)`,
        description: template.description,
        status:      "inactive",
        workflow:    template.content as unknown as Json,
      })
      .select("id")
      .single();

    return { automationId: automation?.id };
  }

  return {};
}

// ─── Rate a template ──────────────────────────────────────────

export async function rateTemplate(opts: {
  templateId:  string;
  workspaceId: string;
  rating:      number; // 1–5
}): Promise<void> {
  const db = createAdminClient();

  await db
    .from("template_ratings")
    .upsert({
      template_id:  opts.templateId,
      workspace_id: opts.workspaceId,
      rating:       Math.min(5, Math.max(1, opts.rating)),
    }, { onConflict: "template_id,workspace_id" });

  // Recompute aggregate rating
  const { data: ratings } = await db
    .from("template_ratings")
    .select("rating")
    .eq("template_id", opts.templateId);

  if (ratings && ratings.length > 0) {
    const sum   = ratings.reduce((acc, r) => acc + r.rating, 0);
    const count = ratings.length;
    await db
      .from("templates")
      .update({ rating_sum: sum, rating_count: count })
      .eq("id", opts.templateId);
  }
}

// ─── Publish a workspace template to marketplace ──────────────

export async function publishTemplate(opts: {
  workspaceId: string;
  createdBy:   string;
  type:        TemplateType;
  name:        string;
  description: string;
  category:    string;
  tags:        string[];
  content:     Record<string, unknown>;
}): Promise<Template> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("templates")
    .insert({
      workspace_id: opts.workspaceId,
      created_by:   opts.createdBy,
      type:         opts.type,
      name:         opts.name,
      description:  opts.description,
      category:     opts.category,
      tags:         opts.tags,
      content:      opts.content as unknown as Json,
      is_public:    true,
      is_featured:  false,
    })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to publish template: ${error?.message}`);
  return toTemplate(data);
}

// ─── Get templates installed by a workspace ───────────────────

export async function getInstalledTemplates(workspaceId: string): Promise<string[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("template_installs")
    .select("template_id")
    .eq("workspace_id", workspaceId);
  return (data ?? []).map((r) => r.template_id);
}

// ─── Helper ───────────────────────────────────────────────────

function toTemplate(row: Record<string, unknown>): Template {
  const sum   = Number(row.rating_sum ?? 0);
  const count = Number(row.rating_count ?? 0);
  return {
    id:           row.id as string,
    workspaceId:  (row.workspace_id as string | null) ?? null,
    type:         row.type as TemplateType,
    name:         row.name as string,
    description:  (row.description as string) ?? "",
    category:     (row.category as string) ?? "general",
    tags:         (row.tags as string[]) ?? [],
    thumbnailUrl: (row.thumbnail_url as string | null) ?? null,
    content:      (row.content as Record<string, unknown>) ?? {},
    isPublic:     Boolean(row.is_public),
    isFeatured:   Boolean(row.is_featured),
    installCount: Number(row.install_count ?? 0),
    ratingAvg:    count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
    ratingCount:  count,
    createdBy:    (row.created_by as string | null) ?? null,
    createdAt:    row.created_at as string,
    updatedAt:    row.updated_at as string,
  };
}
