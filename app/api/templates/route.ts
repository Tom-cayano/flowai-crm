// GET  /api/templates — list public templates
// POST /api/templates — publish a new template

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listTemplates, publishTemplate } from "@/lib/templates/marketplace";
import type { TemplateType } from "@/types/workspace";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params     = req.nextUrl.searchParams;
  const type       = params.get("type") as TemplateType | null;
  const category   = params.get("category") ?? undefined;
  const featured   = params.get("featured") === "1";

  const templates = await listTemplates({ type: type ?? undefined, category, featured });
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    workspaceId: string;
    type:        TemplateType;
    name:        string;
    description: string;
    category:    string;
    tags:        string[];
    content:     Record<string, unknown>;
  };

  try {
    const template = await publishTemplate({ ...body, createdBy: user.id });
    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
