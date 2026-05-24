// ─── Webhook automation engine ────────────────────────────────────────────────
//
// Loads active automations from Supabase, evaluates their conditions against
// an incoming WhatsApp message, and executes every matching action set in
// priority order (highest priority number runs first).
//
// Supported trigger_event: "new_message"
//
// Supported conditions (stored as jsonb in webhook_automations.conditions):
//   keyword        — text to match in the incoming message
//   keyword_match  — "contains" | "starts_with" | "exact" (default: "contains")
//   is_first_message — true | false
//
// Supported action types (stored as jsonb array in webhook_automations.actions):
//   send_message   { type, content }
//   add_tag        { type, tag }
//   change_status  { type, status }
//   assign_agent   { type, agent_name }
//   ai_reply       { type }

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { evolutionSendText } from "./evolution-client";
import { fetchConversationHistory, generateReply } from "./openai-reply";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AutomationConditions {
  keyword?: string;
  keyword_match?: "contains" | "starts_with" | "exact";
  is_first_message?: boolean;
}

export type AutomationActionDef =
  | { type: "send_message"; content: string }
  | { type: "add_tag"; tag: string }
  | { type: "change_status"; status: "open" | "pending" | "resolved" | "spam" }
  | { type: "assign_agent"; agent_name: string }
  | { type: "ai_reply" };

/** All context the engine needs to evaluate conditions and execute actions. */
export interface AutomationContext {
  supabase: SupabaseClient<Database>;
  userId: string;
  conversationId: string;
  contactId: string | null;
  phone: string;           // normalized digits, e.g. "5511999999999"
  incomingText: string;
  isFirstMessage: boolean;
  instanceName: string;    // Evolution API instance name
  serverUrl: string;       // Evolution API server URL (for outbound messages)
  instanceApiKey: string;  // Evolution API key (for outbound messages)
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Runs all active automations that match the current message context.
 * All matching automations execute; they do NOT short-circuit each other.
 * The `ai_reply` action is deduplicated — OpenAI is called at most once.
 */
export async function runAutomations(ctx: AutomationContext): Promise<void> {
  const { data: automations, error } = await ctx.supabase
    .from("webhook_automations")
    .select("id, name, conditions, actions, priority")
    .eq("user_id", ctx.userId)
    .eq("enabled", true)
    .eq("trigger_event", "new_message")
    .order("priority", { ascending: false });

  if (error) {
    console.error("[automation-engine] Failed to load automations:", error.message);
    return;
  }

  if (!automations?.length) return;

  let aiReplyTriggered = false;

  for (const automation of automations) {
    const conditions = automation.conditions as AutomationConditions;
    if (!evaluateConditions(conditions, ctx)) continue;

    console.info(`[automation-engine] "${automation.name}" matched — executing actions`);

    const actions = (automation.actions ?? []) as AutomationActionDef[];
    for (const action of actions) {
      // Deduplicate ai_reply across all automations that fired
      if (action.type === "ai_reply" && aiReplyTriggered) continue;

      await executeAction(action, ctx).catch((err) =>
        console.error(`[automation-engine] Action "${action.type}" failed:`, err)
      );

      if (action.type === "ai_reply") aiReplyTriggered = true;
    }
  }
}

// ─── Condition evaluator ──────────────────────────────────────────────────────

function evaluateConditions(
  conditions: AutomationConditions,
  ctx: Pick<AutomationContext, "incomingText" | "isFirstMessage">
): boolean {
  // is_first_message gate
  if (
    conditions.is_first_message !== undefined &&
    conditions.is_first_message !== ctx.isFirstMessage
  ) {
    return false;
  }

  // Keyword matching
  if (conditions.keyword) {
    const text = ctx.incomingText.toLowerCase();
    const kw = conditions.keyword.toLowerCase();

    switch (conditions.keyword_match ?? "contains") {
      case "contains":
        if (!text.includes(kw)) return false;
        break;
      case "starts_with":
        if (!text.startsWith(kw)) return false;
        break;
      case "exact":
        if (text !== kw) return false;
        break;
    }
  }

  return true;
}

// ─── Action executor ──────────────────────────────────────────────────────────

async function executeAction(
  action: AutomationActionDef,
  ctx: AutomationContext
): Promise<void> {
  switch (action.type) {
    case "send_message": {
      const result = await evolutionSendText(
        ctx.instanceName,
        ctx.serverUrl,
        ctx.instanceApiKey,
        { phone: ctx.phone, text: action.content }
      );
      if (result.ok) {
        await storeOutboundMessage(ctx.supabase, ctx.conversationId, action.content, result.externalId);
      }
      break;
    }

    case "add_tag": {
      if (!ctx.contactId) break;
      const { data: contact } = await ctx.supabase
        .from("contacts")
        .select("tags")
        .eq("id", ctx.contactId)
        .single();
      if (contact) {
        const merged = [...new Set([...contact.tags, action.tag])];
        await ctx.supabase
          .from("contacts")
          .update({ tags: merged })
          .eq("id", ctx.contactId);
      }
      break;
    }

    case "change_status":
      await ctx.supabase
        .from("conversations")
        .update({ status: action.status })
        .eq("id", ctx.conversationId);
      break;

    case "assign_agent":
      await ctx.supabase
        .from("conversations")
        .update({ assigned_to: action.agent_name })
        .eq("id", ctx.conversationId);
      break;

    case "ai_reply":
      await executeAIReply(ctx);
      break;
  }
}

// ─── AI reply action ──────────────────────────────────────────────────────────

async function executeAIReply(ctx: AutomationContext): Promise<void> {
  // Load this user's AI settings — the ai_reply action is a no-op if disabled
  const { data: settings } = await ctx.supabase
    .from("user_ai_settings")
    .select("enabled, model, system_prompt, max_tokens, temperature")
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (!settings?.enabled) {
    console.info("[automation-engine] ai_reply skipped — not enabled for user");
    return;
  }

  // Fetch the last 20 messages as context
  const history = await fetchConversationHistory(ctx.supabase, ctx.conversationId);

  const reply = await generateReply(history, ctx.incomingText, {
    model: settings.model,
    systemPrompt: settings.system_prompt ?? undefined,
    maxTokens: settings.max_tokens,
    temperature: Number(settings.temperature),
  });

  if (!reply) {
    console.warn("[automation-engine] ai_reply produced no output");
    return;
  }

  // Send via Evolution API
  const result = await evolutionSendText(
    ctx.instanceName,
    ctx.serverUrl,
    ctx.instanceApiKey,
    { phone: ctx.phone, text: reply }
  );

  if (result.ok) {
    await storeOutboundMessage(ctx.supabase, ctx.conversationId, reply, result.externalId);
    console.info(`[automation-engine] AI reply sent to ${ctx.phone}`);
  }
}

// ─── Shared outbound message storage ─────────────────────────────────────────

async function storeOutboundMessage(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  content: string,
  externalId?: string
): Promise<void> {
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    content,
    type: "text",
    sender: "agent",
    status: "sent",
    agent_name: "FlowAI",
    external_id: externalId ?? null,
  });

  const now = new Date().toISOString();
  await supabase
    .from("conversations")
    .update({
      last_message_at: now,
      last_message_preview: content.slice(0, 120),
      last_message_sender: "agent",
      updated_at: now,
    })
    .eq("id", conversationId);
}
