// Session processor — handles periodic health checks and reconnect requests.

import { createAdminClient } from "@/lib/supabase/admin";
import { reconnectInstance } from "@/lib/session/monitor";
import type { SessionJob } from "@/lib/queue/types";

export async function processSession(job: SessionJob): Promise<void> {
  const { instanceName, action } = job;
  const db = createAdminClient();

  const { data: instance } = await db
    .from("whatsapp_instances")
    .select("server_url, api_key, connection_state")
    .eq("instance_name", instanceName)
    .maybeSingle();

  if (!instance) {
    console.warn(`[session-processor] Instance "${instanceName}" not found`);
    return;
  }

  switch (action) {
    case "health_check": {
      // health_check is handled by lib/session/monitor — nothing to do here
      console.info(`[session-processor] health_check for "${instanceName}" — state=${instance.connection_state}`);
      break;
    }

    case "reconnect": {
      if (instance.connection_state === "open") {
        console.info(`[session-processor] "${instanceName}" already open — skip reconnect`);
        return;
      }
      const ok = await reconnectInstance(instanceName, instance.server_url, instance.api_key);
      if (!ok) throw new Error(`Reconnect failed for "${instanceName}"`);
      break;
    }

    case "sync_state": {
      // Force a state sync — handled by the connection processor via Evolution
      console.info(`[session-processor] sync_state for "${instanceName}"`);
      break;
    }
  }
}
