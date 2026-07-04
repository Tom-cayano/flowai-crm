// Decides whether a workflow's trigger fires for a given execution context.

import type { TriggerConfig, ExecutionContext } from "@/types/automation";

export function evaluateTrigger(
  trigger: TriggerConfig,
  ctx: ExecutionContext
): boolean {
  switch (trigger.type) {
    case "message_received":
      return true; // Any inbound message — caller controls which automations are queried

    case "first_message":
      return ctx.isFirstMessage;

    case "keyword_match": {
      if (!trigger.keyword) return false;
      const text = ctx.incomingText.toLowerCase();
      const kw   = trigger.keyword.toLowerCase();
      switch (trigger.keywordMatch ?? "contains") {
        case "contains":    return text.includes(kw);
        case "starts_with": return text.startsWith(kw);
        case "exact":       return text === kw;
        case "regex": {
          try { return new RegExp(kw, "i").test(text); } catch { return false; }
        }
        default: return false;
      }
    }

    case "webhook_lead": {
      if (ctx.triggerType !== "webhook_lead") return false;
      // Optional source/event filters — set as variables by the dispatcher
      if (trigger.webhookSource && trigger.webhookSource !== ctx.variables["webhook.source"]) return false;
      if (trigger.webhookEvent  && trigger.webhookEvent  !== ctx.variables["webhook.event"])  return false;
      return true;
    }

    // These trigger types are evaluated at the point of the external event —
    // the webhook / background job already knows they matched.
    case "conversation_created":
    case "conversation_status_changed":
    case "tag_added":
    case "tag_removed":
    case "contact_created":
    case "no_response_timeout":
    case "lead_score_threshold":
    case "business_hours_start":
    case "business_hours_end":
    case "scheduled_cron":
    // Instagram — event already matched by the processor; evaluate here is always true
    case "instagram_dm_received":
    case "instagram_comment_received":
    case "instagram_story_mention":
    case "instagram_first_contact":
    case "instagram_lead_detected":
      return ctx.triggerType === trigger.type;

    default:
      return false;
  }
}
