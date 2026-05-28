// GET  /api/ai/auto-reply/settings — fetch current user's settings
// PATCH /api/ai/auto-reply/settings — update settings (partial)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAutoReplySettings, upsertAutoReplySettings } from "@/lib/ai/auto-reply-settings";

export const dynamic = "force-dynamic";

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await getAutoReplySettings(user.id);
  return NextResponse.json({ settings });
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate mode if provided
  const validModes = ["off", "suggest", "approval", "full_auto"];
  if (body.mode !== undefined && !validModes.includes(body.mode as string)) {
    return NextResponse.json(
      { error: `mode must be one of: ${validModes.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate thresholds
  const numericFields = ["autoSendThreshold", "approvalThreshold"] as const;
  for (const field of numericFields) {
    const val = body[field];
    if (val !== undefined) {
      const n = Number(val);
      if (isNaN(n) || n < 0 || n > 1) {
        return NextResponse.json(
          { error: `${field} must be a number between 0 and 1` },
          { status: 400 }
        );
      }
    }
  }

  const updated = await upsertAutoReplySettings(user.id, body as Parameters<typeof upsertAutoReplySettings>[1]);
  return NextResponse.json({ settings: updated });
}
