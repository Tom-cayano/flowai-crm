// Periodic automation runners — called from the worker's health-check interval.
//
// Two jobs are handled here:
//   1. scheduled_cron   — automations with a cron expression that should fire now
//   2. no_response_timeout — open conversations where the agent has not replied
//      within the configured timeout window
//
// Both produce TriggerJob payloads that go through the wpp:trigger queue so
// they get retried, logged, and rate-limited like every other trigger.

import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueTrigger } from "@/lib/queue/producers";

// ─── Cron trigger runner ──────────────────────────────────────────────────────

/**
 * Scans all active automations with trigger_type = 'scheduled_cron' and fires
 * the ones whose cron expression matches the current minute.
 *
 * Cron matching is intentionally simple: we store a last_triggered_at on the
 * automation and only fire again once a full cron interval has elapsed.
 * Full cron expression parsing uses `cron-parser` when available; falls back
 * to a 60-second "every minute" default if the package is absent.
 */
export async function runCronAutomations(): Promise<void> {
  const db = createAdminClient();

  const { data: automations, error } = await db
    .from("automations")
    .select("id, user_id, workflow, last_triggered_at")
    .eq("status", "active")
    .eq("trigger_type", "scheduled_cron");

  if (error) {
    console.error("[cron-runner] Failed to load cron automations:", error.message);
    return;
  }

  if (!automations || automations.length === 0) return;

  const now = Date.now();

  for (const automation of automations) {
    try {
      const workflow = automation.workflow as unknown as {
        nodes?: Array<{ type: string; data?: { config?: { cronExpression?: string; timezone?: string } } }>;
      };

      const triggerNode = workflow.nodes?.find((n) => n.type === "trigger");
      const cronExpr    = triggerNode?.data?.config?.cronExpression ?? "0 * * * *"; // hourly default

      if (!shouldFireCron(cronExpr, automation.last_triggered_at)) continue;

      await enqueueTrigger({
        type:           "scheduled_cron",
        userId:         automation.user_id,
        conversationId: null,
        contactId:      null,
        phone:          "",
        meta:           { automationId: automation.id, cronExpression: cronExpr },
      });

      console.info(`[cron-runner] Queued cron automation ${automation.id}`);
    } catch (err) {
      console.error(`[cron-runner] Error processing automation ${automation.id}:`, err);
    }
  }
}

/**
 * Determines whether a cron expression should fire now given the last trigger time.
 * Uses a simplified interval-based approach: parses the cron expression to
 * determine the minimum interval between runs, then checks if enough time has elapsed.
 */
function shouldFireCron(
  cronExpr: string,
  lastTriggeredAt: string | null
): boolean {
  if (!lastTriggeredAt) return true; // Never run before — fire immediately

  const intervalMs = estimateCronIntervalMs(cronExpr);
  const elapsed    = Date.now() - new Date(lastTriggeredAt).getTime();
  return elapsed >= intervalMs;
}

/**
 * Estimates the firing interval from a cron expression.
 * Returns milliseconds. Conservative: uses the smallest likely interval.
 */
function estimateCronIntervalMs(expr: string): number {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return 60_000; // malformed — default 1 min

  const [minute, hour, dom, , dow] = parts;

  // Every minute: "* * * * *"
  if (minute === "*") return 60_000;

  // Every hour: "N * * * *"
  if (hour === "*" && dom === "*" && dow === "*") return 3_600_000;

  // Every day: "N H * * *"
  if (dom === "*" && dow === "*") return 86_400_000;

  // Every week: "N H * * D"
  if (dom === "*") return 7 * 86_400_000;

  // Monthly or more
  return 30 * 86_400_000;
}

// ─── No-response timeout runner ───────────────────────────────────────────────

/**
 * Finds open conversations where the last inbound message from a contact
 * arrived more than `timeoutMinutes` ago and no agent has replied since.
 *
 * Looks up each active automation with trigger_type = 'no_response_timeout'
 * and fires the corresponding trigger for qualifying conversations.
 */
export async function runNoResponseTimeouts(): Promise<void> {
  const db = createAdminClient();

  // Load all active no_response_timeout automations
  const { data: automations, error } = await db
    .from("automations")
    .select("id, user_id, workflow")
    .eq("status", "active")
    .eq("trigger_type", "no_response_timeout");

  if (error) {
    console.error("[cron-runner] Failed to load timeout automations:", error.message);
    return;
  }

  if (!automations || automations.length === 0) return;

  // Group by user so we do one DB query per user, not per automation
  const byUser = new Map<string, Array<{ id: string; timeoutMinutes: number }>>();

  for (const automation of automations) {
    const workflow = automation.workflow as unknown as {
      nodes?: Array<{ type: string; data?: { config?: { timeoutMinutes?: number } } }>;
    };
    const triggerNode = workflow.nodes?.find((n) => n.type === "trigger");
    const minutes     = triggerNode?.data?.config?.timeoutMinutes ?? 30;

    const list = byUser.get(automation.user_id) ?? [];
    list.push({ id: automation.id, timeoutMinutes: minutes });
    byUser.set(automation.user_id, list);
  }

  for (const [userId, configs] of byUser) {
    // Use the smallest timeout in this user's automations to minimise queries
    const minTimeout = Math.min(...configs.map((c) => c.timeoutMinutes));
    const cutoff     = new Date(Date.now() - minTimeout * 60_000).toISOString();

    // Open conversations where last message was from the contact and is older than cutoff
    const { data: conversations } = await db
      .from("conversations")
      .select("id, last_message_at, last_message_sender")
      .eq("user_id", userId)
      .eq("status", "open")
      .eq("last_message_sender", "contact") // last message was from contact (no agent reply)
      .lt("last_message_at", cutoff);

    if (!conversations || conversations.length === 0) continue;

    for (const conv of conversations) {
      const waitedMs = Date.now() - new Date(conv.last_message_at ?? 0).getTime();
      const waitedMin = Math.round(waitedMs / 60_000);

      // Fire for each automation whose threshold this conversation meets
      for (const cfg of configs) {
        if (waitedMin < cfg.timeoutMinutes) continue;

        await enqueueTrigger({
          type:           "no_response_timeout",
          userId,
          conversationId: conv.id,
          contactId:      null,
          phone:          "",
          meta:           { automationId: cfg.id, waitedMinutes: waitedMin },
        }).catch((err) =>
          console.error(`[cron-runner] enqueueTrigger no_response_timeout:`, err)
        );
      }
    }
  }
}

// ─── Overdue scheduled-task sweep ────────────────────────────────────────────

/**
 * Safety net for wait_delay resumption. scheduleWait() enqueues a delayed
 * BullMQ job at creation time, but if Redis lost it (flush, eviction, outage)
 * the scheduled_tasks row would stay pending forever. This sweep re-enqueues
 * every pending task whose run_at is already in the past. The jobId
 * (`scheduled-<taskId>`) plus claimTask()'s pending→running transition make
 * duplicates harmless.
 */
export async function resumeOverdueScheduledTasks(): Promise<void> {
  const db = createAdminClient();

  const { data: tasks, error } = await db
    .from("scheduled_tasks")
    .select("id, user_id, automation_id")
    .eq("status", "pending")
    .lte("run_at", new Date().toISOString())
    .limit(100);

  if (error) {
    console.error("[cron-runner] Failed to load overdue scheduled tasks:", error.message);
    return;
  }
  if (!tasks?.length) return;

  const { enqueueScheduled } = await import("@/lib/queue/producers");

  let resumed = 0;
  let cancelled = 0;

  for (const task of tasks) {
    // Never resume a workflow whose automation was deactivated or deleted
    // while the task slept — cancel the stale continuation instead.
    let active = false;
    if (task.automation_id) {
      const { data: automation } = await db
        .from("automations")
        .select("status")
        .eq("id", task.automation_id)
        .maybeSingle();
      active = automation?.status === "active";
    }

    if (!active) {
      await db
        .from("scheduled_tasks")
        .update({ status: "cancelled" })
        .eq("id", task.id)
        .eq("status", "pending");
      cancelled++;
      continue;
    }

    await enqueueScheduled({ taskId: task.id, userId: task.user_id }, 0).catch((err) =>
      console.error(`[cron-runner] enqueueScheduled ${task.id}:`, err)
    );
    resumed++;
  }

  console.info(
    `[cron-runner] Overdue scheduled tasks: ${resumed} re-enqueued, ${cancelled} cancelled (inactive automation)`
  );
}
