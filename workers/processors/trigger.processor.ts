// Trigger processor — handles all non-message automation trigger events.
// Routes TriggerJob payloads to the appropriate trigger-dispatcher function.
// Runs in the wpp:trigger BullMQ worker queue.

import {
  dispatchStatusChanged,
  dispatchTagAdded,
  dispatchTagRemoved,
  dispatchContactCreated,
  dispatchLeadScoreThreshold,
  dispatchConversationCreated,
  dispatchNoResponseTimeout,
  dispatchScheduledCron,
  dispatchWebhookLead,
} from "@/lib/automation/trigger-dispatcher";
import type { TriggerJob } from "@/lib/queue/types";

export async function processTrigger(job: TriggerJob): Promise<void> {
  const start = Date.now();

  try {
    switch (job.type) {
      case "status_changed": {
        const m = job.meta as { fromStatus: string; toStatus: string };
        if (!job.conversationId) break;
        await dispatchStatusChanged({
          userId:         job.userId,
          conversationId: job.conversationId,
          fromStatus:     m.fromStatus ?? "open",
          toStatus:       m.toStatus   ?? "open",
        });
        break;
      }

      case "tag_added": {
        const m = job.meta as { tag: string };
        await dispatchTagAdded({
          userId:         job.userId,
          contactId:      job.contactId ?? "",
          conversationId: job.conversationId,
          tag:            m.tag ?? "",
        });
        break;
      }

      case "tag_removed": {
        const m = job.meta as { tag: string };
        await dispatchTagRemoved({
          userId:         job.userId,
          contactId:      job.contactId ?? "",
          conversationId: job.conversationId,
          tag:            m.tag ?? "",
        });
        break;
      }

      case "contact_created": {
        const m = job.meta as { name: string };
        if (!job.contactId) break;
        await dispatchContactCreated({
          userId:    job.userId,
          contactId: job.contactId,
          phone:     job.phone,
          name:      m.name ?? job.phone,
        });
        break;
      }

      case "lead_score_threshold": {
        const m = job.meta as { score: number };
        await dispatchLeadScoreThreshold({
          userId:         job.userId,
          contactId:      job.contactId ?? "",
          conversationId: job.conversationId,
          score:          m.score ?? 0,
        });
        break;
      }

      case "conversation_created": {
        const m = job.meta as { incomingText: string };
        if (!job.conversationId) break;
        await dispatchConversationCreated({
          userId:         job.userId,
          conversationId: job.conversationId,
          phone:          job.phone,
          incomingText:   m.incomingText ?? "",
        });
        break;
      }

      case "no_response_timeout": {
        const m = job.meta as { waitedMinutes: number };
        if (!job.conversationId) break;
        await dispatchNoResponseTimeout({
          userId:         job.userId,
          conversationId: job.conversationId,
          waitedMinutes:  m.waitedMinutes ?? 0,
        });
        break;
      }

      case "webhook_lead": {
        const m = job.meta as {
          source:      string;
          event:       string;
          contactName: string;
          customData:  Record<string, unknown>;
        };
        if (!job.contactId) break;
        await dispatchWebhookLead({
          userId:      job.userId,
          contactId:   job.contactId,
          phone:       job.phone,
          source:      m.source ?? "",
          event:       m.event  ?? "",
          contactName: m.contactName ?? "",
          customData:  m.customData ?? {},
        });
        break;
      }

      case "scheduled_cron": {
        const m = job.meta as { automationId: string };
        await dispatchScheduledCron({
          userId:       job.userId,
          automationId: m.automationId,
        });
        break;
      }

      default:
        console.warn(`[trigger-processor] Unknown trigger type: ${(job as TriggerJob).type}`);
    }
  } catch (err) {
    console.error(`[trigger-processor] ${job.type} failed:`, err);
    throw err; // re-throw so BullMQ can retry
  }

  console.info(
    `[trigger-processor] ${job.type} user=${job.userId}` +
    ` conv=${job.conversationId ?? "—"} elapsed=${Date.now() - start}ms`
  );
}
