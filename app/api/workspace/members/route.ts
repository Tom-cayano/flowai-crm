// GET  /api/workspace/members?workspaceId=... — list members
// PUT  /api/workspace/members — update member role
// DELETE /api/workspace/members — remove member

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceMembers, updateMemberRole, removeMember } from "@/lib/workspace/workspace";
import { requirePermission, PermissionError } from "@/lib/rbac/permissions";
import type { WorkspaceRole } from "@/types/workspace";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 });

  try {
    await requirePermission(workspaceId, "team.view");
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const members = await getWorkspaceMembers(workspaceId);
  return NextResponse.json({ members });
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspaceId, userId, role } = await req.json() as {
    workspaceId: string;
    userId:      string;
    role:        WorkspaceRole;
  };

  try {
    const ctx = await requirePermission(workspaceId, "team.manage");
    if (userId === ctx.userId) {
      return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  await updateMemberRole(workspaceId, userId, role);
  return NextResponse.json({ updated: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspaceId, userId } = await req.json() as {
    workspaceId: string;
    userId:      string;
  };

  try {
    const ctx = await requirePermission(workspaceId, "team.manage");
    if (userId === ctx.userId) {
      return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  await removeMember(workspaceId, userId);
  return NextResponse.json({ removed: true });
}
