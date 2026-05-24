// POST /api/workspace/invite — send a team invitation
// DELETE /api/workspace/invite — cancel an invitation

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createInvitation } from "@/lib/workspace/workspace";
import { requirePermission, PermissionError } from "@/lib/rbac/permissions";
import { completeOnboardingStep } from "@/lib/onboarding/checklist";
import { checkSeatLimit } from "@/lib/billing/limits";
import type { WorkspaceRole } from "@/types/workspace";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspaceId, email, role } = await req.json() as {
    workspaceId: string;
    email:       string;
    role:        WorkspaceRole;
  };

  try {
    await requirePermission(workspaceId, "team.invite");
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // ── Seat limit check ───────────────────────────────────────────────────────
  const seatCheck = await checkSeatLimit(workspaceId);
  if (!seatCheck.ok) {
    return NextResponse.json(
      {
        error:   `Límite de agentes alcanzado (${seatCheck.current}/${seatCheck.limit}) en el plan ${seatCheck.planName}. Actualiza para agregar más miembros.`,
        code:    "SEAT_LIMIT_REACHED",
        current: seatCheck.current,
        limit:   seatCheck.limit,
        planId:  seatCheck.planId,
      },
      { status: 402 }
    );
  }

  try {
    const invitation = await createInvitation({
      workspaceId,
      email:      email.toLowerCase().trim(),
      role:       role ?? "agent",
      invitedBy:  user.id,
    });

    // Mark onboarding step
    await completeOnboardingStep(workspaceId, "team_member_invited");

    // In production: send invitation email here
    // e.g. await sendInvitationEmail({ email, token: invitation.token, workspaceName })

    return NextResponse.json({ invitation }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { invitationId, workspaceId } = await req.json() as {
    invitationId: string;
    workspaceId:  string;
  };

  try {
    await requirePermission(workspaceId, "team.invite");
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const db = createAdminClient();
  await db.from("workspace_invitations").delete().eq("id", invitationId).eq("workspace_id", workspaceId);

  return NextResponse.json({ deleted: true });
}
