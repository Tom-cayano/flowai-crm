// Session health monitor — checks Evolution API connection state for all active
// instances and repairs discrepancies in the Supabase DB.

import { createAdminClient } from "@/lib/supabase/admin";
import { EvolutionClient, getEvolutionClient } from "@/lib/evolution-client";
import { enqueueSession } from "@/lib/queue/producers";

/**
 * Builds an Evolution client for a specific instance using its own
 * server_url + api_key from the DB (the same per-instance credentials the
 * message and outbound pipelines use). Falls back to the env-based global
 * client only when the row lacks them.
 *
 * Root cause this fixes: the monitor used the global env client, whose
 * EVOLUTION_SERVER_URL on the worker pointed to a stale Evolution server
 * (…-9497) where the "flowai" instance does not exist → 404. Each instance's
 * real server lives in whatsapp_instances.server_url (…-3461).
 */
function clientForInstance(serverUrl: string | null, apiKey: string | null): EvolutionClient {
  if (serverUrl && apiKey) {
    return new EvolutionClient({ serverUrl, apiKey });
  }
  return getEvolutionClient();
}

export interface SessionHealthReport {
  instanceName: string;
  userId: string;
  expectedState: string;
  actualState: string;
  wasRepaired: boolean;
}

export async function runSessionHealthCheck(): Promise<SessionHealthReport[]> {
  const supabase = createAdminClient();
  const reports: SessionHealthReport[] = [];

  const { data: instances, error } = await supabase
    .from("whatsapp_instances")
    .select("id, instance_name, user_id, connection_state, is_active, server_url, api_key")
    .eq("is_active", true);

  if (error || !instances?.length) {
    if (error) console.error("[session-monitor] Failed to load instances:", error.message);
    return reports;
  }

  await Promise.allSettled(
    instances.map(async (instance) => {
      // Per-instance client (each instance may live on a different Evolution
      // server). Falls back to the env client only when the row lacks creds.
      let client: EvolutionClient;
      try {
        client = clientForInstance(instance.server_url, instance.api_key);
      } catch (err) {
        console.error(`[session-monitor] Evolution client unavailable for "${instance.instance_name}":`, err);
        return;
      }

      const result = await client.getConnectionState(instance.instance_name);

      if (!result.ok) {
        console.warn(
          `[session-monitor] Could not reach Evolution for "${instance.instance_name}":`,
          result.status
        );
        return;
      }

      const actualState   = result.data.instance.state as "open" | "close" | "connecting";
      const expectedState = instance.connection_state;
      const mismatch      = actualState !== expectedState;

      if (mismatch) {
        await supabase
          .from("whatsapp_instances")
          .update({ connection_state: actualState, updated_at: new Date().toISOString() })
          .eq("id", instance.id);

        // Audit log — non-critical
        try {
          await supabase.from("session_health_events").insert({
            instance_id: instance.id,
            user_id:     instance.user_id,
            event_type:  "state_mismatch_repaired",
            from_state:  expectedState,
            to_state:    actualState,
          });
        } catch {
          // ignore
        }

        if (actualState === "close" && expectedState === "open") {
          await enqueueSession({
            instanceName: instance.instance_name,
            userId:       instance.user_id,
            action:       "reconnect",
          });
        }
      }

      reports.push({
        instanceName: instance.instance_name,
        userId:       instance.user_id,
        expectedState,
        actualState,
        wasRepaired:  mismatch,
      });
    })
  );

  return reports;
}

export async function reconnectInstance(
  instanceName: string
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("whatsapp_instances")
    .select("server_url, api_key")
    .eq("instance_name", instanceName)
    .maybeSingle();

  let client: EvolutionClient;
  try {
    client = clientForInstance(row?.server_url ?? null, row?.api_key ?? null);
  } catch (err) {
    console.error(`[session-monitor] Evolution client unavailable for reconnect "${instanceName}":`, err);
    return false;
  }

  // New client uses restartInstance (not restart)
  const result = await client.restartInstance(instanceName);

  if (!result.ok) {
    console.error(`[session-monitor] Reconnect failed for "${instanceName}":`, result.status);
    return false;
  }

  console.info(`[session-monitor] Reconnect initiated for "${instanceName}"`);
  return true;
}
