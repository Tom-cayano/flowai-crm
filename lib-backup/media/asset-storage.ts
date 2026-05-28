/**
 * Asset Storage — workspace branding & logo uploads.
 *
 * Bucket:  workspace-assets  (create once in Supabase dashboard)
 * Layout:  {workspaceId}/{category}/{filename}.webp
 *
 * Security model:
 *   - Server-side uploads use the admin client (service role).
 *   - Signed upload URLs (for client-direct uploads) are scoped to the
 *     calling workspace's prefix — tenants cannot write to each other's paths.
 *   - Downloads use either signed read URLs (private bucket) or public CDN
 *     URLs with long-lived Cache-Control headers (public bucket).
 *
 * WebP optimisation:
 *   - All incoming images are converted to WebP via sharp (server-side).
 *   - Logos: max 512×512, quality 90.
 *   - Thumbnails: max 256×256, quality 80.
 *   - Raw files ≤ MAX_FILE_BYTES are accepted; larger ones are rejected.
 */

import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";

// ─── Config ───────────────────────────────────────────────────────────────────

export const ASSET_BUCKET = "workspace-assets";

export type AssetCategory = "logo" | "thumbnail" | "banner";

const CATEGORY_CONFIG: Record<
  AssetCategory,
  { maxWidth: number; maxHeight: number; quality: number }
> = {
  logo:      { maxWidth: 512, maxHeight: 512, quality: 90 },
  thumbnail: { maxWidth: 256, maxHeight: 256, quality: 80 },
  banner:    { maxWidth: 1200, maxHeight: 400, quality: 85 },
};

/** Max upload size before WebP optimisation (8 MB) */
const MAX_FILE_BYTES = 8 * 1024 * 1024;

/** Accepted MIME types for image uploads */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

// ─── Result types ─────────────────────────────────────────────────────────────

export type AssetUploadResult =
  | { ok: true;  publicUrl: string; storagePath: string; sizeBytes: number }
  | { ok: false; error: string; code: AssetErrorCode };

export type SignedUploadGrantResult =
  | { ok: true;  signedUrl: string; token: string; path: string }
  | { ok: false; error: string; code: AssetErrorCode };

export type SignedReadResult =
  | { ok: true;  signedUrl: string; expiresAt: number }
  | { ok: false; error: string; code: AssetErrorCode };

export type AssetDeleteResult =
  | { ok: true }
  | { ok: false; error: string; code: AssetErrorCode };

export type AssetErrorCode =
  | "FILE_TOO_LARGE"
  | "INVALID_MIME_TYPE"
  | "PROCESSING_ERROR"
  | "STORAGE_ERROR"
  | "NOT_FOUND"
  | "PERMISSION_DENIED";

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  error?: string;
  code?: AssetErrorCode;
}

export function validateImageFile(
  sizeBytes: number,
  mimeType: string
): ValidationResult {
  if (sizeBytes > MAX_FILE_BYTES) {
    return {
      valid: false,
      error: `File too large. Maximum allowed size is ${MAX_FILE_BYTES / (1024 * 1024)} MB.`,
      code: "FILE_TOO_LARGE",
    };
  }

  // Normalise (browser may send "image/jpg" instead of "image/jpeg")
  const normalised = mimeType.toLowerCase().replace("image/jpg", "image/jpeg");
  if (!ALLOWED_MIME_TYPES.has(normalised)) {
    return {
      valid: false,
      error: `Invalid file type "${mimeType}". Allowed types: JPEG, PNG, WebP, GIF, SVG.`,
      code: "INVALID_MIME_TYPE",
    };
  }

  return { valid: true };
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Canonical storage path for an asset.
 * Pattern: {workspaceId}/{category}/{uuid}.webp
 *
 * Using a random UUID ensures atomic replacement — the old file stays valid
 * in CDN caches while the new one propagates.
 */
export function buildAssetPath(
  workspaceId: string,
  category: AssetCategory,
  fileId: string
): string {
  return `${workspaceId}/${category}/${fileId}.webp`;
}

function randomId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// ─── Server-side upload (with WebP conversion) ───────────────────────────────

/**
 * Upload an image buffer to Supabase Storage.
 *
 * Converts any input image to WebP, resizes to category limits,
 * then uploads with a CDN-safe long-lived cache header.
 *
 * @param workspaceId  Tenant namespace — used as path prefix.
 * @param category     Asset category (controls resize bounds).
 * @param buffer       Raw image bytes from form upload.
 * @param mimeType     MIME type reported by the client.
 * @param options.fileId   Optional deterministic ID (for overwrite semantics).
 */
export async function uploadWorkspaceAsset(
  workspaceId: string,
  category: AssetCategory,
  buffer: Buffer,
  mimeType: string,
  options?: { fileId?: string; uploadedBy?: string }
): Promise<AssetUploadResult> {
  // 1. Validate
  const validation = validateImageFile(buffer.byteLength, mimeType);
  if (!validation.valid) {
    return { ok: false, error: validation.error!, code: validation.code! };
  }

  // 2. Convert to WebP
  const cfg = CATEGORY_CONFIG[category];
  let webpBuffer: Buffer;
  try {
    const pipeline = sharp(buffer).resize({
      width: cfg.maxWidth,
      height: cfg.maxHeight,
      fit: "inside",          // preserve aspect ratio, never upscale
      withoutEnlargement: true,
    });

    // SVGs don't get rasterised — pass through losslessly
    if (mimeType === "image/svg+xml") {
      webpBuffer = buffer;
    } else {
      webpBuffer = await pipeline
        .webp({ quality: cfg.quality, effort: 4 })
        .toBuffer();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Image processing failed: ${msg}`, code: "PROCESSING_ERROR" };
  }

  // 3. Build path
  const fileId      = options?.fileId ?? randomId();
  const storagePath = buildAssetPath(workspaceId, category, fileId);
  const contentType = mimeType === "image/svg+xml" ? "image/svg+xml" : "image/webp";

  // 4. Upload via admin client (bypasses RLS — path is workspace-scoped by design)
  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(storagePath, webpBuffer, {
      contentType,
      upsert: true,           // replace previous version atomically
      cacheControl: "public, max-age=31536000, immutable", // 1-year CDN cache
    });

  if (error) {
    return { ok: false, error: error.message, code: "STORAGE_ERROR" };
  }

  const { data: urlData } = supabase.storage
    .from(ASSET_BUCKET)
    .getPublicUrl(storagePath);

  // Fire-and-forget audit record (never block the upload response)
  if (options?.uploadedBy) {
    void Promise.resolve(
      supabase
        .from("asset_uploads")
        .insert({
          workspace_id:     workspaceId,
          uploaded_by:      options.uploadedBy,
          category,
          storage_path:     storagePath,
          public_url:       urlData.publicUrl,
          mime_type:        contentType,
          size_bytes:       buffer.byteLength,
          size_bytes_webp:  mimeType !== "image/svg+xml" ? webpBuffer.byteLength : null,
        })
    ).catch(() => { /* audit must never block */ });
  }

  return {
    ok: true,
    publicUrl: urlData.publicUrl,
    storagePath,
    sizeBytes: webpBuffer.byteLength,
  };

}

// ─── Signed upload URL (for client-direct uploads) ───────────────────────────

/**
 * Issue a short-lived signed upload URL for a workspace-scoped path.
 *
 * The token is scoped to the exact path — a tenant cannot use it to
 * overwrite another workspace's assets.
 *
 * @param workspaceId  Determines the path prefix.
 * @param category     Asset category.
 * @param expiresIn    URL lifetime in seconds (default: 300 — 5 minutes).
 */
export async function createSignedUploadUrl(
  workspaceId: string,
  category: AssetCategory,
  expiresIn = 300
): Promise<SignedUploadGrantResult> {
  const supabase    = createAdminClient();
  const fileId      = randomId();
  const storagePath = buildAssetPath(workspaceId, category, fileId);

  const { data, error } = await supabase.storage
    .from(ASSET_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to create signed URL", code: "STORAGE_ERROR" };
  }

  return {
    ok: true,
    signedUrl: data.signedUrl,
    token: data.token,
    path: storagePath,
  };
}

// ─── Signed read URL (for private assets) ────────────────────────────────────

/**
 * Issue a short-lived signed download URL.
 * Only meaningful if the bucket is set to private in Supabase.
 *
 * @param storagePath  Full path returned from a previous upload.
 * @param expiresIn    Lifetime in seconds (default: 3600 — 1 hour).
 */
export async function createSignedReadUrl(
  storagePath: string,
  expiresIn = 3600
): Promise<SignedReadResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(ASSET_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to create signed URL", code: "STORAGE_ERROR" };
  }

  return {
    ok: true,
    signedUrl: data.signedUrl,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

// ─── Delete asset ─────────────────────────────────────────────────────────────

/**
 * Delete an asset from storage.
 * Always validates that the path belongs to the given workspaceId.
 */
export async function deleteWorkspaceAsset(
  workspaceId: string,
  storagePath: string
): Promise<AssetDeleteResult> {
  // Security: path must start with workspaceId prefix
  if (!storagePath.startsWith(`${workspaceId}/`)) {
    return { ok: false, error: "Path does not belong to this workspace", code: "PERMISSION_DENIED" };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(ASSET_BUCKET)
    .remove([storagePath]);

  if (error) {
    return { ok: false, error: error.message, code: "STORAGE_ERROR" };
  }

  return { ok: true };
}

// ─── List assets for a workspace ─────────────────────────────────────────────

export interface StorageAsset {
  name:        string;
  path:        string;
  publicUrl:   string;
  sizeBytes:   number;
  uploadedAt:  string;
  category:    AssetCategory;
}

export async function listWorkspaceAssets(
  workspaceId: string,
  category?: AssetCategory
): Promise<StorageAsset[]> {
  const supabase = createAdminClient();
  const prefix   = category ? `${workspaceId}/${category}` : workspaceId;

  const { data, error } = await supabase.storage
    .from(ASSET_BUCKET)
    .list(prefix, { limit: 100, sortBy: { column: "created_at", order: "desc" } });

  if (error || !data) return [];

  return data
    .filter((f) => f.name && !f.name.endsWith("/"))   // skip folder entries
    .map((f) => {
      const filePath = `${prefix}/${f.name}`;
      const { data: urlData } = supabase.storage.from(ASSET_BUCKET).getPublicUrl(filePath);
      const cat = category ?? (filePath.split("/")[1] as AssetCategory);

      return {
        name:       f.name,
        path:       filePath,
        publicUrl:  urlData.publicUrl,
        sizeBytes:  f.metadata?.size ?? 0,
        uploadedAt: f.created_at ?? new Date().toISOString(),
        category:   cat,
      };
    });
}

// ─── Public URL helper (no auth required) ────────────────────────────────────

export function getPublicAssetUrl(storagePath: string): string {
  const supabase = createAdminClient();
  const { data } = supabase.storage.from(ASSET_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}
