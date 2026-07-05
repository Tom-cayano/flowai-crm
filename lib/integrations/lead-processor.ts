// Core processor for universal lead webhooks.
//
// Given an integration_events row, this module:
//   1. Upserts the contact (no duplicates — matched by phone/whatsapp/email)
//   2. Records the outcome on the event row
//   3. Dispatches matching automations through the trigger queue
//      (falling back to inline execution if Redis is unreachable)
//
// It is called inline from POST /api/webhooks/leads and re-invoked by the
// lead-webhook retry worker with exponential backoff, so it must be idempotent:
// re-processing an event updates the same contact instead of duplicating it.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  dispatchWebhookLead,
  dispatchContactCreated,
} from "@/lib/automation/trigger-dispatcher";
import { normalizeWebhookKey } from "@/lib/automation/trigger-evaluator";
import type { Database, Json } from "@/types/supabase";
import type {
  IntegrationRecord,
  LeadWebhookContact,
  LeadWebhookPayload,
  LeadProcessResult,
} from "./types";

type Db = SupabaseClient<Database>;

// Contact keys mapped to first-class columns; everything else → custom_fields
const KNOWN_CONTACT_KEYS = new Set([
  "name", "email", "phone", "whatsapp", "instagram",
  "company", "location", "notes", "tags",
]);

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Processes a stored integration event end-to-end.
 * Throws on failure so callers (route / retry worker) can schedule a retry.
 */
export async function processLeadEvent(eventId: string): Promise<LeadProcessResult> {
  const db = createAdminClient();
  const startedAt = Date.now();

  const { data: event, error: eventError } = await db
    .from("integration_events")
    .select("id, integration_id, user_id, source, event, payload, status, attempts")
    .eq("id", eventId)
    .single();

  if (eventError || !event) {
    throw new Error(`integration_events ${eventId} not found: ${eventError?.message ?? "no row"}`);
  }

  const { data: integration, error: intError } = await db
    .from("webhook_integrations")
    .select("id, user_id, name, source_key, enabled, hmac_secret, default_tags")
    .eq("id", event.integration_id)
    .single();

  if (intError || !integration) {
    throw new Error(`webhook_integrations ${event.integration_id} not found`);
  }

  try {
    const payload = event.payload as LeadWebhookPayload;

    // 1. Contact upsert
    const contactResult = await upsertContact(db, integration, payload);

    // 2. Find automations whose webhook_lead trigger matches source + event
    const matches = await findMatchingAutomations(
      db,
      event.user_id,
      event.source,
      event.event
    );

    // 3. Dispatch execution (queue first, inline fallback — never lose the lead)
    await dispatchAutomations(event.user_id, event.source, event.event, payload, contactResult);

    // 4. Mark the event processed
    await db
      .from("integration_events")
      .update({
        status:                "processed",
        error:                 null,
        attempts:              event.attempts + 1,
        contact_id:            contactResult.contactId,
        contact_created:       contactResult.contactCreated,
        automations_triggered: matches as unknown as Json,
        processing_ms:         Date.now() - startedAt,
        processed_at:          new Date().toISOString(),
      })
      .eq("id", eventId);

    await updateIntegrationStats(db, integration.id, "processed", null);

    return {
      contactId:            contactResult.contactId,
      contactCreated:       contactResult.contactCreated,
      automationsTriggered: matches,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await db
      .from("integration_events")
      .update({
        status:        "failed",
        error:         message,
        attempts:      event.attempts + 1,
        processing_ms: Date.now() - startedAt,
      })
      .eq("id", eventId);

    await updateIntegrationStats(db, integration.id, "failed", message);
    throw err;
  }
}

// ─── Contact upsert ───────────────────────────────────────────────────────────

interface ContactUpsertResult {
  contactId:      string;
  contactCreated: boolean;
  name:           string;
  phone:          string;
  tags:           string[];
}

/** Digits-only phone normalization: "+34 600-111-222" → "34600111222". */
function normalizePhone(phone: string | undefined | null): string {
  return (phone ?? "").replace(/\D/g, "");
}

function extractCustomFields(
  contact: LeadWebhookContact,
  customData: Record<string, unknown> | undefined
): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(contact)) {
    if (!KNOWN_CONTACT_KEYS.has(key) && value !== undefined && value !== null) {
      extra[key] = value;
    }
  }
  return { ...extra, ...(customData ?? {}) };
}

async function upsertContact(
  db: Db,
  integration: IntegrationRecord,
  payload: LeadWebhookPayload
): Promise<ContactUpsertResult> {
  const contact = payload.contact ?? {};

  const email    = typeof contact.email === "string" ? contact.email.trim().toLowerCase() : "";
  const rawPhone = typeof contact.phone === "string" && contact.phone.trim()
    ? contact.phone.trim()
    : typeof contact.whatsapp === "string" ? contact.whatsapp.trim() : "";
  const phone    = normalizePhone(rawPhone);

  if (!email && !phone && !contact.name) {
    throw new Error("contact requires at least one of: name, email, phone");
  }

  const incomingTags = Array.isArray(contact.tags)
    ? contact.tags.filter((t): t is string => typeof t === "string" && t.length > 0)
    : [];
  const tags = [...new Set([...incomingTags, ...integration.default_tags])];

  const customFields = extractCustomFields(contact, payload.custom_data);
  const now = new Date().toISOString();

  // ── Find an existing contact by phone / whatsapp / email ──────────────────
  const orFilters: string[] = [];
  if (phone) {
    orFilters.push(`phone.eq.${phone}`, `whatsapp.eq.${phone}`);
    if (rawPhone !== phone) orFilters.push(`phone.eq.${rawPhone}`, `whatsapp.eq.${rawPhone}`);
  }
  if (email) orFilters.push(`email.eq.${email}`);

  let existing: { id: string; name: string; tags: string[]; custom_fields: Json; source: string | null } | null = null;

  if (orFilters.length > 0) {
    const { data } = await db
      .from("contacts")
      .select("id, name, tags, custom_fields, source")
      .eq("user_id", integration.user_id)
      .or(orFilters.join(","))
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    existing = data ?? null;
  }

  const stringOr = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;

  if (existing) {
    // ── Update: merge without clobbering existing data with blanks ──────────
    const mergedCustom = {
      ...((existing.custom_fields as Record<string, unknown>) ?? {}),
      ...customFields,
    };

    await db
      .from("contacts")
      .update({
        name:             stringOr(contact.name) ?? existing.name,
        ...(email                       ? { email } : {}),
        ...(phone                       ? { phone } : {}),
        ...(stringOr(contact.whatsapp)  ? { whatsapp: normalizePhone(contact.whatsapp as string) } : {}),
        ...(stringOr(contact.instagram) ? { instagram: (contact.instagram as string).trim() } : {}),
        ...(stringOr(contact.company)   ? { company: (contact.company as string).trim() } : {}),
        ...(stringOr(contact.location)  ? { location: (contact.location as string).trim() } : {}),
        ...(stringOr(contact.notes)     ? { notes: (contact.notes as string).trim() } : {}),
        tags:             [...new Set([...existing.tags, ...tags])],
        custom_fields:    mergedCustom as Json,
        source:           existing.source ?? integration.source_key,
        last_interaction: now,
      })
      .eq("id", existing.id);

    return {
      contactId:      existing.id,
      contactCreated: false,
      name:           stringOr(contact.name) ?? existing.name,
      phone,
      tags,
    };
  }

  // ── Create ────────────────────────────────────────────────────────────────
  const name =
    stringOr(contact.name) ??
    (email || rawPhone || `Lead ${integration.name}`);

  const { data: created, error } = await db
    .from("contacts")
    .insert({
      user_id:          integration.user_id,
      name,
      phone:            phone || null,
      whatsapp:         stringOr(contact.whatsapp) ? normalizePhone(contact.whatsapp as string) : phone || null,
      email:            email || null,
      instagram:        stringOr(contact.instagram) ?? null,
      company:          stringOr(contact.company) ?? null,
      location:         stringOr(contact.location) ?? null,
      notes:            stringOr(contact.notes) ?? null,
      status:           "active",
      tags,
      source:           integration.source_key,
      custom_fields:    customFields as Json,
      last_interaction: now,
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(`Failed to create contact: ${error?.message ?? "no row returned"}`);
  }

  return { contactId: created.id, contactCreated: true, name, phone, tags };
}

// ─── Automation matching ──────────────────────────────────────────────────────

interface WorkflowTriggerNode {
  type?: string;
  data?: {
    config?: {
      type?:          string;
      webhookSource?: string;
      webhookEvent?:  string;
    };
  };
}

/**
 * Lists active automations with a webhook_lead trigger whose source/event
 * filters match this event. Empty filter = matches everything.
 * (Execution-time conditions inside the workflow are evaluated by the engine.)
 */
export async function findMatchingAutomations(
  db: Db,
  userId: string,
  source: string,
  event: string
): Promise<Array<{ id: string; name: string }>> {
  const { data: automations, error } = await db
    .from("automations")
    .select("id, name, workflow")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("trigger_type", "webhook_lead");

  if (error) {
    console.error("[lead-processor] Failed to load automations:", error.message);
    return [];
  }

  const matches: Array<{ id: string; name: string }> = [];

  for (const automation of automations ?? []) {
    const workflow = automation.workflow as { nodes?: WorkflowTriggerNode[] } | null;
    const triggerNode = workflow?.nodes?.find(
      (n) => n.type === "trigger" || n.data?.config?.type === "webhook_lead"
    );
    const cfg = triggerNode?.data?.config ?? {};

    // Same normalized comparison the engine uses (trigger-evaluator)
    const sourceOk =
      !cfg.webhookSource ||
      normalizeWebhookKey(cfg.webhookSource) === normalizeWebhookKey(source);
    const eventOk =
      !cfg.webhookEvent ||
      normalizeWebhookKey(cfg.webhookEvent) === normalizeWebhookKey(event);

    if (sourceOk && eventOk) matches.push({ id: automation.id, name: automation.name });
  }

  return matches;
}

// ─── Automation dispatch ──────────────────────────────────────────────────────

/**
 * Executes matching automations immediately (inline) — the enrollment starts
 * the moment the webhook arrives. The engine itself provides per-automation
 * failure isolation, dedup and rate limiting; wait_delay nodes suspend into
 * scheduled_tasks, so inline dispatch never blocks on long workflows.
 */
async function dispatchAutomations(
  userId: string,
  source: string,
  event: string,
  payload: LeadWebhookPayload,
  contact: ContactUpsertResult
): Promise<void> {
  await dispatchWebhookLead({
    userId,
    contactId:   contact.contactId,
    phone:       contact.phone,
    source,
    event,
    contactName: contact.name,
    customData:  (payload.custom_data ?? {}) as Record<string, unknown>,
  });

  // Parity with the rest of the CRM: a brand-new contact also fires the
  // existing contact_created trigger.
  if (contact.contactCreated) {
    await dispatchContactCreated({
      userId,
      contactId: contact.contactId,
      phone:     contact.phone,
      name:      contact.name,
    });
  }
}

// ─── Integration stats ────────────────────────────────────────────────────────

async function updateIntegrationStats(
  db: Db,
  integrationId: string,
  status: "processed" | "failed",
  error: string | null
): Promise<void> {
  try {
    const { data: current } = await db
      .from("webhook_integrations")
      .select("total_events, total_errors")
      .eq("id", integrationId)
      .single();

    await db
      .from("webhook_integrations")
      .update({
        total_events:      (current?.total_events ?? 0) + 1,
        total_errors:      (current?.total_errors ?? 0) + (status === "failed" ? 1 : 0),
        last_event_at:     new Date().toISOString(),
        last_event_status: status,
        last_error:        error,
      })
      .eq("id", integrationId);
  } catch (err) {
    console.error("[lead-processor] Failed to update integration stats:", err);
  }
}
