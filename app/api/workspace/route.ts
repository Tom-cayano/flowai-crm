// GET   /api/workspace — list user's workspaces
// POST  /api/workspace — create a new workspace (sub-workspace for agency)
// PATCH /api/workspace — update workspace branding / settings (white_label gated)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserWorkspaces, createWorkspace, updateWorkspaceBranding } from "@/lib/workspace/workspace";
import { getAuthContext } from "@/lib/rbac/permissions";
import { assertFeature, BillingError, billingErrorToResponse } from "@/lib/billing/guards";
import { checkWorkspaceLimit } from "@/lib/billing/limits";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaces = await getUserWorkspaces(user.id);
  return NextResponse.json({ workspaces });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, parentId } = await req.json() as { name: string; parentId?: string };
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  // Sub-workspace creation requires agency plan and workspace limit check
  if (parentId) {
    try {
      await assertFeature(parentId, "sub_workspaces");
    } catch (err) {
      if (err instanceof BillingError) {
        const { status, body } = billingErrorToResponse(err);
        return NextResponse.json(body, { status });
      }
      throw err;
    }

    const limitCheck = await checkWorkspaceLimit(parentId);
    if (!limitCheck.ok) {
      return NextResponse.json(
        {
          error:   `Límite de sub-workspaces alcanzado (${limitCheck.current}/${limitCheck.limit}) en el plan ${limitCheck.planName}.`,
          code:    "WORKSPACE_LIMIT_REACHED",
          current: limitCheck.current,
          limit:   limitCheck.limit,
        },
        { status: 402 }
      );
    }
  }

  try {
    const workspace = await createWorkspace({ ownerId: user.id, name: name.trim(), parentId });
    return NextResponse.json({ workspace }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    workspaceId?:  string;
    name?:         string;
    logoUrl?:      string | null;
    primaryColor?: string;
    companyName?:  string | null;
    supportEmail?: string | null;
    customDomain?: string | null;
  };

  const { workspaceId } = body;
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  // ── Permission check ───────────────────────────────────────────────────────
  const ctx = await getAuthContext(workspaceId);
  if (!ctx || ctx.userId !== user.id) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  if (!["owner", "admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  // ── White-label feature gate (logo, color, company name) ──────────────────
  const isBrandingChange = body.logoUrl !== undefined || body.primaryColor !== undefined || body.companyName !== undefined;
  if (isBrandingChange) {
    try {
      await assertFeature(workspaceId, "white_label");
    } catch (err) {
      if (err instanceof BillingError) {
        const { status, body: b } = billingErrorToResponse(err);
        return NextResponse.json(b, { status });
      }
      throw err;
    }
  }

  try {
    await updateWorkspaceBranding(workspaceId, {
      name:         body.name,
      logoUrl:      body.logoUrl,
      primaryColor: body.primaryColor,
      companyName:  body.companyName,
      supportEmail: body.supportEmail,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
