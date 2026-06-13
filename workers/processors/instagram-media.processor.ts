// Instagram media processor — downloads media from Meta CDN and uploads to
// Supabase Storage. Updates the instagram_messages row with the stored URL.
//
// Meta CDN URLs expire in ~24h; we must download promptly after the message arrives.

import { createAdminClient } from "@/lib/supabase/admin";
import type { IGMediaJob } from "@/lib/queue/types";

export async function processIGMedia(job: IGMediaJob): Promise<void> {
  const db = createAdminClient();

  // Fetch raw bytes from Meta CDN
  let arrayBuffer: ArrayBuffer;
  try {
    const res = await fetch(job.mediaUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Meta CDN returned ${res.status}`);
    arrayBuffer = await res.arrayBuffer();
  } catch (err) {
    console.error("[ig-media] Download failed:", err);
    throw err; // let BullMQ retry
  }

  const ext      = job.mediaType === "video" ? "mp4" : job.mediaType === "audio" ? "mp3" : "jpg";
  const mimeType = job.mimeType ?? (job.mediaType === "video" ? "video/mp4" : job.mediaType === "audio" ? "audio/mpeg" : "image/jpeg");
  const path     = `instagram/${job.userId}/${job.accountId}/${job.mid}.${ext}`;

  const { error: uploadErr } = await db.storage
    .from("media")
    .upload(path, arrayBuffer, { contentType: mimeType, upsert: true });

  if (uploadErr) {
    console.error("[ig-media] Storage upload failed:", uploadErr.message);
    throw new Error(uploadErr.message);
  }

  const { data: { publicUrl } } = db.storage.from("media").getPublicUrl(path);

  await db.from("instagram_messages")
    .update({ media_url: publicUrl })
    .eq("id", job.messageId);

  // Mirror permanent URL to the CRM messages table so the UI can render it.
  // instagram_messages.external_id holds the messages.id cross-reference.
  const { data: igMsg } = await db
    .from("instagram_messages")
    .select("external_id")
    .eq("id", job.messageId)
    .single();

  if (igMsg?.external_id) {
    await db.from("messages")
      .update({ media_url: publicUrl })
      .eq("id", igMsg.external_id);
  }

  console.info(`[ig-media] Stored ${job.mediaType} → ${publicUrl}`);
}
