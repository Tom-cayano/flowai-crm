// Automation processor — dispatches to the new workflow engine (visual automations)
// and the legacy webhook_automations engine. Both coexist.
//
// The triggerType field introduced in AutomationJob lets the caller specify which
// trigger event to route — defaults to "message_received" for backward compatibility.

import { runMatchingAutomations } from "@/lib/automation/engine";
import { runAutomations } from "@/lib/webhook/automation-engine";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AutomationJob } from "@/lib/queue/types";
import type { ExecutionContext, TriggerType } from "@/types/automation";

export async function processAutomation(job: AutomationJob): Promise<void> {
  const start = Date.now();

  const triggerType: TriggerType =
    (job.triggerType as TriggerType | undefined) ?? "message_received";

  // ── New visual workflow engine ─────────────────────────────────────────────
  const ctx: ExecutionContext = {
    executionId:    "",    // assigned per-automation inside engine.ts
    automationId:   "",    // assigned per-automation inside engine.ts
    userId:         job.userId,
    conversationId: job.conversationId,
    contactId:      job.contactId,
    phone:          job.phone,
    instanceName:   job.instanceName,
    serverUrl:      job.serverUrl,
    instanceApiKey: job.instanceApiKey,
    incomingText:   job.incomingText,
    isFirstMessage: job.isFirstMessage,
    triggerType,
    variables:      {},
    // Instagram context — only present for IG triggers
    igAccountId: job.igAccountId,
    igCommentId: job.igCommentId,
    igMediaId:   job.igMediaId,
    igUserId:    job.igUserId,
    // WhatsApp Cloud API context
    wacAccountId: job.wacAccountId,
    // Facebook Messenger context
    fbmPageId:    job.fbmPageId,
  };

  await runMatchingAutomations(ctx);

  // ── Legacy webhook_automations engine (message_received only) ─────────────
  // The legacy engine does not understand non-message triggers, so only
  // dispatch it for the default message_received case.
  if (triggerType === "message_received" && job.conversationId) {
    await runAutomations({
      supabase:       createAdminClient(),
      userId:         job.userId,
      conversationId: job.conversationId,
      contactId:      job.contactId,
      phone:          job.phone,
      incomingText:   job.incomingText,
      isFirstMessage: job.isFirstMessage,
      instanceName:   job.instanceName,
      serverUrl:      job.serverUrl,
      instanceApiKey: job.instanceApiKey,
    });
  }

  console.info(
    `[automation-processor] trigger=${triggerType} conv=${job.conversationId}` +
    ` elapsed=${Date.now() - start}ms`
  );
}
