// Media pipeline — download media from Evolution API, upload to Supabase Storage.
//
// Flow:
//   1. Worker receives a MediaJob (after the message row is inserted)
//   2. This module calls Evolution API to get the base64 content
//   3. Converts to Buffer, detects extension from MIME type
//   4. Uploads to Supabase Storage bucket "whatsapp-media"
//   5. Returns the public URL to be stored in whatsapp_messages.media_url

import { createAdminClient } from "@/lib/supabase/admin";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DownloadResult =
  | { ok: true; base64: string; mimeType: string; fileName: string; sizeBytes: number }
  | { ok: false; error: string };

export type UploadResult =
  | { ok: true; publicUrl: string; storagePath: string }
  | { ok: false; error: string };

// ─── Download from Evolution API ──────────────────────────────────────────────

/**
 * Calls Evolution API to fetch media as base64.
 * Evolution endpoint: GET /chat/getBase64FromMediaMessage/{instanceName}
 * Body: { message: { key: { id, remoteJid, fromMe } } }
 */
export async function downloadMediaFromEvolution(
  serverUrl: string,
  apiKey: string,
  instanceName: string,
  externalId: string,
  remoteJid: string
): Promise<DownloadResult> {
  const url = `${serverUrl.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${instanceName}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        message: {
          key: {
            id: externalId,
            remoteJid,
            fromMe: false,
          },
        },
        convertToMp4: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Network error: ${msg}` };
  }

  if (!response.ok) {
    return { ok: false, error: `Evolution HTTP ${response.status}` };
  }

  const json = await response.json().catch(() => ({})) as Record<string, unknown>;

  // Evolution returns: { base64: "...", mediaType: "image", mimetype: "image/jpeg" }
  const base64    = json.base64 as string | undefined;
  const mimeType  = (json.mimetype ?? json.mediaType ?? "application/octet-stream") as string;

  if (!base64) {
    return { ok: false, error: "Evolution returned no base64 content" };
  }

  const buffer    = Buffer.from(base64, "base64");
  const ext       = mimeTypeToExt(mimeType);
  const fileName  = `media_${Date.now()}${ext}`;

  return {
    ok: true,
    base64,
    mimeType,
    fileName,
    sizeBytes: buffer.byteLength,
  };
}

// ─── Upload to Supabase Storage ───────────────────────────────────────────────

const BUCKET = "whatsapp-media";

/**
 * Uploads media buffer to Supabase Storage and returns the public URL.
 * Path pattern: {userId}/{instanceName}/{YYYY-MM}/{messageId}.{ext}
 */
export async function uploadToSupabaseStorage(
  userId: string,
  instanceName: string,
  messageId: string,
  base64: string,
  mimeType: string
): Promise<UploadResult> {
  const supabase  = createAdminClient();
  const buffer    = Buffer.from(base64, "base64");
  const ext       = mimeTypeToExt(mimeType);
  const monthDir  = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const storagePath = `${userId}/${instanceName}/${monthDir}/${messageId}${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false,
      cacheControl: "31536000", // 1 year
    });

  if (error) {
    return { ok: false, error: error.message };
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  return {
    ok: true,
    publicUrl: urlData.publicUrl,
    storagePath,
  };
}

// ─── Combined pipeline ────────────────────────────────────────────────────────

export interface MediaPipelineInput {
  serverUrl: string;
  apiKey: string;
  instanceName: string;
  externalId: string;
  remoteJid: string;
  userId: string;
  messageId: string;  // whatsapp_messages.id to update
}

export interface MediaPipelineResult {
  ok: boolean;
  publicUrl?: string;
  storagePath?: string;
  error?: string;
}

/**
 * Full pipeline: download → upload → update DB row.
 * Returns the final public URL on success.
 */
export async function runMediaPipeline(
  input: MediaPipelineInput
): Promise<MediaPipelineResult> {
  // 1. Download
  const download = await downloadMediaFromEvolution(
    input.serverUrl,
    input.apiKey,
    input.instanceName,
    input.externalId,
    input.remoteJid
  );

  if (!download.ok) {
    return { ok: false, error: download.error };
  }

  // 2. Upload
  const upload = await uploadToSupabaseStorage(
    input.userId,
    input.instanceName,
    input.messageId,
    download.base64,
    download.mimeType
  );

  if (!upload.ok) {
    return { ok: false, error: upload.error };
  }

  // 3. Update DB
  const supabase = createAdminClient();
  await supabase
    .from("whatsapp_messages")
    .update({
      media_url:       upload.publicUrl,
      media_mime_type: download.mimeType,
      media_size:      download.sizeBytes,
    })
    .eq("id", input.messageId);

  return {
    ok: true,
    publicUrl: upload.publicUrl,
    storagePath: upload.storagePath,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mimeTypeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg":       ".jpg",
    "image/png":        ".png",
    "image/webp":       ".webp",
    "image/gif":        ".gif",
    "video/mp4":        ".mp4",
    "video/webm":       ".webm",
    "audio/ogg":        ".ogg",
    "audio/mpeg":       ".mp3",
    "audio/mp4":        ".m4a",
    "audio/aac":        ".aac",
    "application/pdf":  ".pdf",
    "application/zip":  ".zip",
  };
  return map[mimeType] ?? ".bin";
}
