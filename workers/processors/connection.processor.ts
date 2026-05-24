// Connection state processor — persists instance connection changes to the DB
// and broadcasts to Supabase realtime so the UI updates immediately.

import { createAdminClient } from "@/lib/supabase/admin";
import { eventBus } from "@/lib/event-bus";
import type { TablesUpdate } from "@/types/supabase";
import type { ConnectionJob } from "@/lib/queue/types";

export async function processConnection(job: ConnectionJob): Promise<void> {
  const { instanceName, state, phone, displayName } = job;
  const db = createAdminClient();

  const update: TablesUpdate<"whatsapp_instances"> = {
    connection_state: state,
    updated_at:       new Date().toISOString(),
    ...(phone       ? { phone_number:  phone }       : {}),
    ...(displayName ? { display_name:  displayName } : {}),
  };

  const { data: instance, error } = await db
    .from("whatsapp_instances")
    .update(update)
    .eq("instance_name", instanceName)
    .select("id, user_id")
    .maybeSingle();

  if (error) {
    console.error(`[conn-processor] DB update failed for "${instanceName}":`, error.message);
    throw new Error(error.message);
  }

  // Write session health event for audit trail (non-critical)
  if (instance) {
    try {
      await db.from("session_health_events").insert({
        instance_id: instance.id,
        user_id:     instance.user_id,
        event_type:  `connection_${state}`,
        to_state:    state,
      });
    } catch {
      // non-critical — don't fail the job
    }
  }

  eventBus.emit("connection:changed", {
    instanceName,
    state,
    userId: instance?.user_id,
  });

  console.info(`[conn-processor] "${instanceName}" → ${state}`);
}
