/**
 * DELETE /api/assets/delete
 *
 * Remove an asset from workspace-scoped storage.
 * Validates that the storagePath prefix belongs to the calling workspace.
 *
 * Body (JSON):
 *   { workspaceId: string, storagePath: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteWorkspaceAsset } from "@/lib/media/asset-storage";

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { workspaceId?: string; storagePath?: string };
  const { workspaceId, storagePath } = body;

  if (!workspaceId || !storagePath) {
    return NextResponse.json({ ok: false, error: "Missing workspaceId or storagePath" }, { status: 400 });
  }

  // Verify membership / ownership
  const db = createAdminClient();
  const [{ data: member }, { data: ws }] = await Promise.all([
    db.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", user.id).eq("is_active", true).single(),
    db.from("workspaces").select("owner_id").eq("id", workspaceId).single(),
  ]);

  if (!member && ws?.owner_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Access denied" }, { status: 403 });
  }

  const result = await deleteWorkspaceAsset(workspaceId, storagePath);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, code: result.code }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
