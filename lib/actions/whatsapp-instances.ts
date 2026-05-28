"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEvolutionClient } from "@/lib/evolution-client";
import type { Tables, TablesUpdate } from "@/types/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WhatsAppInstance = Tables<"whatsapp_instances">;

type Ok<T> = { data: T; error: null };
type Err = { data: null; error: string };
type Result<T> = Ok<T> | Err;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInstanceName(userId: string, label: string): string {
  // Sanitize label: lowercase alphanumeric + hyphens, max 32 chars
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20);
  // Prefix with short userId segment to guarantee uniqueness across users
  const prefix = userId.replace(/-/g, "").slice(0, 8);
  return `${prefix}-${slug}`;
}

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Extracts a human-readable error message from the new EvolutionClient response.
 * The new client returns { ok: false, status, data } where data may contain
 * an error/message field from the Evolution API JSON response.
 */
function extractEvoError(data: unknown, status: number): string {
  if (typeof data === "object" && data !== null) {
    const d = data as Record<string, unknown>;
    if (typeof d.message === "string") return d.message;
    if (typeof d.error === "string") return d.error;
  }
  if (typeof data === "string") return data;
  return `HTTP ${status}`;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getInstances(): Promise<Result<WhatsAppInstance[]>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return { data: null, error: "No autenticado" };

  const { data, error } = await supabase
    .from("whatsapp_instances")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createInstance(payload: {
  label: string;
  serverUrl?: string;
  apiKey?: string;
}): Promise<Result<WhatsAppInstance>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return { data: null, error: "No autenticado" };

  const label = payload.label.trim();
  if (!label) return { data: null, error: "El nombre de la instancia es obligatorio" };

  const instanceName = makeInstanceName(user.id, label);

  // 1. Build Evolution client (reads EVOLUTION_SERVER_URL + EVOLUTION_API_KEY from ENV)
  const rawApiKey    = process.env.EVOLUTION_API_KEY ?? "";
  const rawServerUrl = process.env.EVOLUTION_SERVER_URL ?? "";

  console.log("[EVOLUTION DEBUG] createInstance action", {
    instanceName,
    url: `${rawServerUrl}/instance/create`,
    hasApiKey:    !!rawApiKey,
    apiKeyLength: rawApiKey.trim().length,
    headers: { apikey: rawApiKey ? rawApiKey.trim().slice(0, 6) + "…" : "MISSING" },
  });

  let evoClient;
  try {
    evoClient = getEvolutionClient();
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }

  // 2. Create the instance on Evolution API
  const evoResult = await evoClient.createInstance({
    instanceName,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
  });

  console.log("[EVOLUTION DEBUG] createInstance result", {
    ok: evoResult.ok,
    status: evoResult.status,
    data: JSON.stringify(evoResult.data).slice(0, 300),
  });

  if (!evoResult.ok) {
    return {
      data: null,
      error: `Evolution API: ${extractEvoError(evoResult.data, evoResult.status)}`,
    };
  }

  // 3. Register the CRM webhook on the new instance
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://flowaicrm.com"}/api/webhook/whatsapp`;
  await evoClient
    .setWebhook(instanceName, {
      url: webhookUrl,
      webhookByEvents: false,
      webhookBase64: false,
      events: [
        "MESSAGES_UPSERT",
        "MESSAGES_UPDATE",
        "MESSAGES_DELETE",
        "CONNECTION_UPDATE",
        "SEND_MESSAGE",
        "PRESENCE_UPDATE",
      ],
    })
    .catch((err) =>
      console.warn("[whatsapp-instances] setWebhook failed (non-blocking):", err)
    );

  // 4. Persist the instance in Supabase — store canonical ENV values, not user input
  const serverUrl = process.env.EVOLUTION_SERVER_URL ?? "";
  const apiKey = process.env.EVOLUTION_API_KEY ?? "";

  const { data, error } = await supabase
    .from("whatsapp_instances")
    .insert({
      user_id: user.id,
      instance_name: instanceName,
      server_url: serverUrl.replace(/\/$/, ""),
      api_key: apiKey,
      label,
      connection_state: "close" as const,
      is_active: true,
      webhook_set: true,
    })
    .select()
    .single();

  if (error) {
    // Best-effort cleanup on Evolution if DB insert failed
    await evoClient.deleteInstance(instanceName).catch(() => null);
    return { data: null, error: error.message };
  }

  revalidatePath("/whatsapp");
  return { data: data as WhatsAppInstance, error: null };
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteInstance(instanceId: string): Promise<Result<void>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return { data: null, error: "No autenticado" };

  // Fetch instance name before deleting from DB
  const { data: instance, error: fetchErr } = await supabase
    .from("whatsapp_instances")
    .select("instance_name")
    .eq("id", instanceId)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !instance) {
    return { data: null, error: "Instancia no encontrada" };
  }

  // Delete from Evolution API first (non-blocking on failure)
  try {
    const evoClient = getEvolutionClient();
    await evoClient.deleteInstance(instance.instance_name).catch((err) =>
      console.warn("[whatsapp-instances] Evolution delete failed (continuing):", err)
    );
  } catch (err) {
    console.warn("[whatsapp-instances] Evolution client unavailable during delete:", err);
  }

  // Delete from Supabase (cascades to conversations etc. via FK)
  const { error } = await supabase
    .from("whatsapp_instances")
    .delete()
    .eq("id", instanceId)
    .eq("user_id", user.id);

  if (error) return { data: null, error: error.message };

  revalidatePath("/whatsapp");
  return { data: undefined, error: null };
}

// ─── Disconnect (logout) ──────────────────────────────────────────────────────

export async function disconnectInstance(instanceId: string): Promise<Result<void>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return { data: null, error: "No autenticado" };

  const { data: instance, error: fetchErr } = await supabase
    .from("whatsapp_instances")
    .select("instance_name")
    .eq("id", instanceId)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !instance) {
    return { data: null, error: "Instancia no encontrada" };
  }

  let evoClient;
  try {
    evoClient = getEvolutionClient();
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }

  // New client uses logoutInstance (not logout)
  const result = await evoClient.logoutInstance(instance.instance_name);

  if (!result.ok) {
    return {
      data: null,
      error: extractEvoError(result.data, result.status),
    };
  }

  // Update local state — webhook will update connection_state when Evolution fires
  await supabase
    .from("whatsapp_instances")
    .update({ connection_state: "close" })
    .eq("id", instanceId);

  revalidatePath("/whatsapp");
  return { data: undefined, error: null };
}

// ─── Refresh connection state from Evolution API ───────────────────────────────

export async function syncInstanceState(instanceId: string): Promise<Result<{
  state: string;
  phone?: string | null;
}>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return { data: null, error: "No autenticado" };

  const { data: instance, error: fetchErr } = await supabase
    .from("whatsapp_instances")
    .select("instance_name")
    .eq("id", instanceId)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !instance) {
    return { data: null, error: "Instancia no encontrada" };
  }

  let evoClient;
  try {
    evoClient = getEvolutionClient();
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }

  const stateResult = await evoClient.getConnectionState(instance.instance_name);

  if (!stateResult.ok) {
    return {
      data: null,
      error: extractEvoError(stateResult.data, stateResult.status),
    };
  }

  const state = stateResult.data.instance.state as "open" | "close" | "connecting";

  await supabase
    .from("whatsapp_instances")
    .update({ connection_state: state })
    .eq("id", instanceId);

  revalidatePath("/whatsapp");
  return { data: { state }, error: null };
}

// ─── Get QR code (server action for client polling) ───────────────────────────

export async function getInstanceQR(instanceId: string): Promise<Result<{
  base64: string;
}>> {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return { data: null, error: "No autenticado" };

  const { data: instance, error: fetchErr } = await supabase
    .from("whatsapp_instances")
    .select("instance_name, connection_state")
    .eq("id", instanceId)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !instance) {
    return { data: null, error: "Instancia no encontrada" };
  }

  if (instance.connection_state === "open") {
    return { data: null, error: "ALREADY_CONNECTED" };
  }

  let evoClient;
  try {
    evoClient = getEvolutionClient();
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : String(err) };
  }

  const qrResult = await evoClient.getQRCode(instance.instance_name);

  if (!qrResult.ok) {
    return {
      data: null,
      error: extractEvoError(qrResult.data, qrResult.status),
    };
  }

  // Extract base64 directly from EvolutionQRCode — no extractQRBase64 helper needed
  const base64 = qrResult.data.base64 ?? null;
  if (!base64) {
    return { data: null, error: "QR não disponível — tente novamente em alguns segundos" };
  }

  return { data: { base64 }, error: null };
}

// ─── Admin: update connection state (called by webhook handler) ───────────────

export async function adminUpdateConnectionState(
  instanceName: string,
  state: "open" | "close" | "connecting",
  extras?: { phone?: string; displayName?: string; avatarUrl?: string }
): Promise<void> {
  const supabase = createAdminClient();

  const update: TablesUpdate<"whatsapp_instances"> = {
    connection_state: state,
    updated_at: new Date().toISOString(),
    ...(extras?.phone ? { phone_number: extras.phone } : {}),
    ...(extras?.displayName ? { display_name: extras.displayName } : {}),
    ...(extras?.avatarUrl ? { avatar_url: extras.avatarUrl } : {}),
  };

  const { error } = await supabase
    .from("whatsapp_instances")
    .update(update)
    .eq("instance_name", instanceName);

  if (error) {
    console.warn(`[whatsapp-instances] Failed to update state for "${instanceName}":`, error.message);
  }
}
