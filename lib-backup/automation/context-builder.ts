// Enriches a bare ExecutionContext with live data from the DB.
// Called once at the start of runWorkflow so condition nodes can evaluate
// contact.name, conversation.status, contact.lead_score, etc.
//
// Only DB reads happen here — no mutations, no side-effects.

import { createAdminClient } from "@/lib/supabase/admin";
import type { ExecutionContext } from "@/types/automation";

export interface EnrichedVariables extends Record<string, string | number | boolean> {
  "contact.name":             string;
  "contact.phone":            string;
  "contact.lead_score":       number;
  "conversation.status":      string;
  "conversation.channel":     string;
  "conversation.assigned_to": string;
  "conversation.unread_count": number;
  "is_business_hours":        boolean;
}

/**
 * Returns a new variables object with contact + conversation fields populated.
 * Safe to call with null IDs — returns empty-string/0 defaults.
 */
export async function buildEnrichedVariables(
  ctx: Pick<ExecutionContext, "userId" | "conversationId" | "contactId" | "phone">
): Promise<EnrichedVariables> {
  const db = createAdminClient();

  const base: EnrichedVariables = {
    "contact.name":              "",
    "contact.phone":             ctx.phone,
    "contact.lead_score":        0,
    "conversation.status":       "open",
    "conversation.channel":      "whatsapp",
    "conversation.assigned_to":  "",
    "conversation.unread_count": 0,
    "is_business_hours":         isBusinessHours(),
  };

  // ── Contact ──────────────────────────────────────────────────────────────────
  if (ctx.contactId) {
    const { data: contact } = await db
      .from("contacts")
      .select("name, phone, tags")
      .eq("id", ctx.contactId)
      .maybeSingle();

    if (contact) {
      base["contact.name"]  = contact.name ?? "";
      base["contact.phone"] = contact.phone ?? ctx.phone;
      // Tags stored as string[] in jsonb — surfaced through FieldBag not variables
    }

    // Lead score
    const { data: scoreRow } = await db
      .from("contact_scores")
      .select("score")
      .eq("contact_id", ctx.contactId)
      .maybeSingle();

    if (scoreRow) {
      base["contact.lead_score"] = scoreRow.score ?? 0;
    }
  }

  // ── Conversation ─────────────────────────────────────────────────────────────
  if (ctx.conversationId) {
    const { data: conv } = await db
      .from("conversations")
      .select("status, channel, assigned_to, unread_count")
      .eq("id", ctx.conversationId)
      .maybeSingle();

    if (conv) {
      base["conversation.status"]       = conv.status ?? "open";
      base["conversation.channel"]      = conv.channel ?? "whatsapp";
      base["conversation.assigned_to"]  = conv.assigned_to ?? "";
      base["conversation.unread_count"] = conv.unread_count ?? 0;
    }
  }

  return base;
}

/**
 * Loads contact tags separately — used to populate FieldBag.contactTags
 * so the in_list / not_in_list operators on contact.tags work correctly.
 */
export async function loadContactTags(contactId: string | null): Promise<string[]> {
  if (!contactId) return [];
  const db = createAdminClient();
  const { data } = await db
    .from("contacts")
    .select("tags")
    .eq("id", contactId)
    .maybeSingle();
  return Array.isArray(data?.tags) ? (data.tags as string[]) : [];
}

/**
 * Loads conversation tags separately — used to populate FieldBag.conversationTags.
 */
export async function loadConversationTags(conversationId: string | null): Promise<string[]> {
  if (!conversationId) return [];
  const db = createAdminClient();
  const { data } = await db
    .from("conversations")
    .select("tags")
    .eq("id", conversationId)
    .maybeSingle();
  return Array.isArray(data?.tags) ? (data.tags as string[]) : [];
}

// ─── Business hours helper ────────────────────────────────────────────────────

function isBusinessHours(): boolean {
  const now = new Date();
  const hour = now.getHours();
  const day  = now.getDay(); // 0 = Sunday
  return day >= 1 && day <= 5 && hour >= 9 && hour < 18;
}
