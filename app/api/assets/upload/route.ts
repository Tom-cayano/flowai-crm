/**
 * POST /api/assets/upload
 *
 * Server-side route handler for workspace branding asset uploads.
 * Accepts multipart/form-data. Converts images to WebP, enforces quotas,
 * validates tenant scope, and returns the public CDN URL.
 *
 * Body (multipart/form-data):
 *   - file       : image file
 *   - workspaceId: string (must match authenticated user's workspace)
 *   - category   : "logo" | "thumbnail" | "banner"
 *
 * Response (JSON):
 *   - ok: true  → { publicUrl, storagePath, sizeBytes }
 *   - ok: false → { error, code }
 *
 * Security:
 *   - Session is validated via Supabase auth (server-side cookie).
 *   - workspaceId is verified against the calling user's membership.
 *   - Storage path is workspace-prefixed — cross-tenant writes are blocked
 *     in asset-storage.ts by path prefix check.
 *   - File size enforced at parse time (not just header — body is streamed).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  uploadWorkspaceAsset,
  validateImageFile,
  type AssetCategory,
} from "@/lib/media/asset-storage";
import { updateWorkspaceBranding } from "@/lib/workspace/workspace";
import { assertFeature, BillingError, billingErrorToResponse } from "@/lib/billing/guards";

const ALLOWED_CATEGORIES = new Set<AssetCategory>(["logo", "thumbnail", "banner"]);

/** Hard cap on the entire request body (includes multipart overhead) */
const MAX_REQUEST_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── 1. Auth ──────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  // ── 2. Content-Length guard (fast-fail before buffering) ─────────────────
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_REQUEST_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Request body too large", code: "FILE_TOO_LARGE" },
      { status: 413 }
    );
  }

  // ── 3. Parse multipart body ───────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid multipart body", code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  const fileField    = formData.get("file");
  const workspaceId  = formData.get("workspaceId")?.toString();
  const categoryStr  = formData.get("category")?.toString();
  const autoApply    = formData.get("autoApply")?.toString() === "true";

  if (!fileField || typeof fileField === "string") {
    return NextResponse.json({ ok: false, error: "Missing file field", code: "BAD_REQUEST" }, { status: 400 });
  }
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "Missing workspaceId", code: "BAD_REQUEST" }, { status: 400 });
  }
  if (!categoryStr || !ALLOWED_CATEGORIES.has(categoryStr as AssetCategory)) {
    return NextResponse.json(
      { ok: false, error: `Invalid category. Must be one of: ${[...ALLOWED_CATEGORIES].join(", ")}`, code: "BAD_REQUEST" },
      { status: 400 }
    );
  }

  const category = categoryStr as AssetCategory;
  const file      = fileField as File;

  // ── 4. Validate file before buffering (MIME + declared size) ─────────────
  const preCheck = validateImageFile(file.size, file.type);
  if (!preCheck.valid) {
    return NextResponse.json(
      { ok: false, error: preCheck.error, code: preCheck.code },
      { status: 400 }
    );
  }

  // ── 5. Verify caller is a member of the workspace ────────────────────────
  const db = createAdminClient();
  const { data: member } = await db
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  // Also accept workspace owners who may not have a member row yet
  const { data: workspace } = await db
    .from("workspaces")
    .select("id, owner_id")
    .eq("id", workspaceId)
    .single();

  const isOwner  = workspace?.owner_id === user.id;
  const isMember = Boolean(member);

  if (!isOwner && !isMember) {
    return NextResponse.json(
      { ok: false, error: "Access denied to this workspace", code: "PERMISSION_DENIED" },
      { status: 403 }
    );
  }

  // ── 6. White-label feature gate (logo uploads only) ──────────────────────
  if (category === "logo") {
    try {
      await assertFeature(workspaceId, "white_label");
    } catch (err) {
      if (err instanceof BillingError) {
        const { status, body } = billingErrorToResponse(err);
        return NextResponse.json({ ok: false, ...body }, { status });
      }
      throw err;
    }
  }

  // ── 7. Buffer file bytes ──────────────────────────────────────────────────
  let buffer: Buffer;
  try {
    const arrayBuffer = await file.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Failed to read file", code: "PROCESSING_ERROR" },
      { status: 500 }
    );
  }

  // ── 8. Validate actual byte length (client-declared size can be spoofed) ──
  const actualCheck = validateImageFile(buffer.byteLength, file.type);
  if (!actualCheck.valid) {
    return NextResponse.json(
      { ok: false, error: actualCheck.error, code: actualCheck.code },
      { status: 400 }
    );
  }

  // ── 9. Upload (convert → WebP → Supabase Storage) ────────────────────────
  const result = await uploadWorkspaceAsset(workspaceId, category, buffer, file.type, {
    uploadedBy: user.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, code: result.code },
      { status: 500 }
    );
  }

  // ── 10. Auto-apply logo to workspace branding if requested ───────────────
  if (autoApply && category === "logo") {
    await updateWorkspaceBranding(workspaceId, { logoUrl: result.publicUrl });
  }

  return NextResponse.json({
    ok: true,
    publicUrl:   result.publicUrl,
    storagePath: result.storagePath,
    sizeBytes:   result.sizeBytes,
    category,
  });
}

/**
 * GET /api/assets/upload?workspaceId=...&category=...
 *
 * Issues a signed upload URL for client-direct uploads (without piping
 * the file through the Next.js server). Use when you want the browser to
 * stream directly to Supabase Storage.
 *
 * After uploading to the signed URL, call POST /api/assets/finalize to
 * run WebP conversion and update the workspace record.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get("workspaceId");
  const categoryStr = searchParams.get("category");

  if (!workspaceId || !categoryStr || !ALLOWED_CATEGORIES.has(categoryStr as AssetCategory)) {
    return NextResponse.json({ ok: false, error: "Missing or invalid parameters" }, { status: 400 });
  }

  // Verify membership
  const db = createAdminClient();
  const { data: member } = await db
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  const { data: ws } = await db
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .single();

  if (!member && ws?.owner_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Access denied" }, { status: 403 });
  }

  const { createSignedUploadUrl } = await import("@/lib/media/asset-storage");
  const grant = await createSignedUploadUrl(workspaceId, categoryStr as AssetCategory);

  if (!grant.ok) {
    return NextResponse.json({ ok: false, error: grant.error }, { status: 500 });
  }

  return NextResponse.json({
    ok:        true,
    signedUrl: grant.signedUrl,
    token:     grant.token,
    path:      grant.path,
  });
}
