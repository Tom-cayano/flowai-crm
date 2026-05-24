// Media processor — downloads media from Evolution API and uploads to
// Supabase Storage. Updates the whatsapp_messages row with the public URL.

import { createAdminClient } from "@/lib/supabase/admin";
import { runMediaPipeline } from "@/lib/media/pipeline";
import { eventBus } from "@/lib/event-bus";
import type { MediaJob } from "@/lib/queue/types";

export async function processMedia(job: MediaJob): Promise<void> {
  const { messageId, externalId, instanceName, userId } = job;

  // Fetch instance credentials
  const db = createAdminClient();
  const { data: instance } = await db
    .from("whatsapp_instances")
    .select("server_url, api_key")
    .eq("instance_name", instanceName)
    .maybeSingle();

  if (!instance) {
    console.warn(`[media-processor] Instance "${instanceName}" not found — skipping media`);
    return;
  }

  // Get the remote_jid from the whatsapp_messages row so we can call Evolution
  const { data: message } = await db
    .from("whatsapp_messages")
    .select("remote_jid")
    .eq("id", messageId)
    .maybeSingle();

  if (!message) {
    console.warn(`[media-processor] Message ${messageId} not found — skipping`);
    return;
  }

  const result = await runMediaPipeline({
    serverUrl:    instance.server_url,
    apiKey:       instance.api_key,
    instanceName,
    externalId,
    remoteJid:    message.remote_jid,
    userId,
    messageId,
  });

  if (!result.ok) {
    console.error(`[media-processor] Pipeline failed for ${messageId}:`, result.error);
    throw new Error(result.error); // Let BullMQ retry
  }

  eventBus.emit("media:uploaded", {
    messageId,
    publicUrl: result.publicUrl!,
  });

  console.info(`[media-processor] Uploaded media for ${messageId} → ${result.publicUrl}`);
}
