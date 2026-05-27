// Automation workflow execution engine.
//
// Entry points:
//   runMatchingAutomations(ctx)  — fired on every trigger event
//   resumeWorkflow(ctx, nodeId)  — fired by scheduled processor after wait_delay
//
// Per-execution guarantees:
//   • Deduplication   — 30-second Redis dedup window per (automation, conversation)
//   • Rate limiting   — 20 executions/automation/conversation/hour (env-configurable)
//   • Context enrichment — contact/conversation DB data loaded into ctx.variables
//   • Step cap        — max 50 nodes per execution (prevents infinite loops)
//   • Cancellation    — checked at the start of each node iteration
//   • Variable persistence — ctx.variables saved after every action
//   • Failure isolation   — per-automation try/catch; one failure does not abort others

import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateTrigger } from "./trigger-evaluator";
import { evaluateCondition, type FieldBag } from "./condition-evaluator";
import { executeAction } from "./action-executor";
import { scheduleWait } from "./scheduler";
import {
  isDuplicate,
  isRateLimited,
  isCancelled,
  isAutomationActive,
} from "./execution-guard";
import {
  buildEnrichedVariables,
  loadContactTags,
  loadConversationTags,
} from "./context-builder";
import type {
  WorkflowGraph,
  WorkflowNode,
  WorkflowEdge,
  TriggerNodeData,
  ConditionNodeData,
  ActionNodeData,
  BranchNodeData,
  DelayNodeData,
  ExecutionContext,
  LogLevel,
} from "@/types/automation";

const MAX_STEPS = 50; // circuit breaker — max nodes walked per execution

// ─── Public entry points ──────────────────────────────────────────────────────

/** Run all active automations matching ctx.triggerType. */
export async function runMatchingAutomations(ctx: ExecutionContext): Promise<void> {
  const db = createAdminClient();

  const { data: automations, error } = await db
    .from("automations")
    .select("id, name, workflow, trigger_type")
    .eq("user_id", ctx.userId)
    .eq("status", "active")
    .eq("trigger_type", ctx.triggerType);

  if (error) {
    console.error("[engine] Failed to load automations:", error.message);
    return;
  }

  for (const automation of automations ?? []) {
    const workflow = automation.workflow as unknown as WorkflowGraph;

    await runWorkflow(
      { ...ctx, automationId: automation.id },
      workflow
    ).catch((err: unknown) =>
      console.error(`[engine] Workflow ${automation.id} threw:`, err)
    );
  }
}

/** Resume a suspended workflow from a specific node (after wait_delay). */
export async function resumeWorkflow(
  ctx: ExecutionContext,
  startNodeId: string
): Promise<void> {
  const db = createAdminClient();
  const { data: automation } = await db
    .from("automations")
    .select("workflow")
    .eq("id", ctx.automationId)
    .single();

  if (!automation) return;

  const workflow = automation.workflow as unknown as WorkflowGraph;
  await runWorkflow(ctx, workflow, startNodeId);
}

// ─── Core executor ────────────────────────────────────────────────────────────

async function runWorkflow(
  ctx: ExecutionContext,
  workflow: WorkflowGraph,
  startNodeId?: string
): Promise<void> {
  const db = createAdminClient();

  // ── Pre-flight guards ─────────────────────────────────────────────────────
  if (!startNodeId) {
    // Only apply dedup + rate limit on new executions, not resumes
    if (await isDuplicate(ctx.automationId, ctx.conversationId)) {
      console.info(
        `[engine] Dedup skip — automation=${ctx.automationId} conv=${ctx.conversationId}`
      );
      return;
    }
    if (await isRateLimited(ctx.automationId, ctx.conversationId)) {
      console.warn(
        `[engine] Rate-limited — automation=${ctx.automationId} conv=${ctx.conversationId}`
      );
      return;
    }
    if (!(await isAutomationActive(ctx.automationId))) {
      console.info(`[engine] Automation ${ctx.automationId} is no longer active — skipping`);
      return;
    }
  }

  // ── Enrich context with live DB data ──────────────────────────────────────
  const enriched = await buildEnrichedVariables(ctx);
  const mutableCtx: ExecutionContext = {
    ...ctx,
    variables: { ...enriched, ...ctx.variables }, // caller-supplied vars win
  };

  const contactTags      = await loadContactTags(ctx.contactId);
  const conversationTags = await loadConversationTags(ctx.conversationId);

  // ── Create execution record ───────────────────────────────────────────────
  const isResume = !!startNodeId && !!ctx.executionId;

  let executionId = ctx.executionId;

  if (!isResume) {
    const { data: exec, error: execErr } = await db
      .from("automation_executions")
      .insert({
        automation_id:   mutableCtx.automationId,
        user_id:         mutableCtx.userId,
        conversation_id: mutableCtx.conversationId,
        contact_id:      mutableCtx.contactId,
        status:          "running",
        context:         mutableCtx.variables as unknown as import("@/types/supabase").Json,
      })
      .select("id")
      .single();

    if (execErr || !exec) {
      console.error("[engine] Could not create execution:", execErr?.message);
      return;
    }

    executionId = exec.id;
  }

  mutableCtx.executionId = executionId;

  // ── Build graph lookup maps ───────────────────────────────────────────────
  const nodeMap = new Map<string, WorkflowNode>(workflow.nodes.map((n) => [n.id, n]));
  const edgeMap = new Map<string, WorkflowEdge[]>();
  for (const edge of workflow.edges) {
    const list = edgeMap.get(edge.source) ?? [];
    list.push(edge);
    edgeMap.set(edge.source, list);
  }

  // ── Step logger ───────────────────────────────────────────────────────────
  const log = async (
    nodeId: string,
    nodeType: string,
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>
  ): Promise<void> => {
    await db.from("automation_step_logs").insert({
      execution_id: executionId,
      node_id:      nodeId,
      node_type:    nodeType,
      level,
      message,
      data: data ? (data as unknown as import("@/types/supabase").Json) : null,
    });
  };

  // ── Resolve starting node ─────────────────────────────────────────────────
  const startNode = startNodeId
    ? nodeMap.get(startNodeId)
    : workflow.nodes.find((n) => n.type === "trigger");

  if (!startNode) {
    await markFailed(db, executionId, "No start node found");
    return;
  }

  // ── Evaluate trigger (new executions only) ────────────────────────────────
  if (!startNodeId && startNode.type === "trigger") {
    const triggerData = startNode.data as TriggerNodeData;
    if (!evaluateTrigger(triggerData.config, mutableCtx)) {
      await db
        .from("automation_executions")
        .update({
          status:       "cancelled",
          error:        "Trigger condition not met",
          completed_at: new Date().toISOString(),
        })
        .eq("id", executionId);
      return;
    }
  }

  // ── Walk the graph ────────────────────────────────────────────────────────
  // Start from the node AFTER the trigger (trigger itself has no work to do)
  let currentNode: WorkflowNode | undefined =
    startNodeId
      ? startNode
      : followEdge(startNode, edgeMap, nodeMap);

  let steps = 0;

  try {
    while (currentNode) {
      // Circuit breaker
      if (++steps > MAX_STEPS) {
        await log("__engine__", "engine", "error",
          `Max step limit (${MAX_STEPS}) exceeded — aborting to prevent infinite loop`);
        break;
      }

      // Cancellation check (every node)
      if (await isCancelled(executionId)) {
        console.info(`[engine] Execution ${executionId} was cancelled externally`);
        return;
      }

      await db
        .from("automation_executions")
        .update({ current_node_id: currentNode.id })
        .eq("id", executionId);

      let nextNodeId: string | null = null;

      // ── Condition ────────────────────────────────────────────────────────
      if (currentNode.type === "condition") {
        const data = currentNode.data as ConditionNodeData;
        const bag: FieldBag = {
          ctx:              mutableCtx,
          contactTags,
          conversationTags,
          leadScore:        mutableCtx.variables["contact.lead_score"] as number,
        };
        const result = evaluateCondition(data.condition, bag);
        await log(currentNode.id, "condition", "info",
          `Condición: ${result ? "verdadera → Sí" : "falsa → No"}`,
          { result }
        );

        const edges = edgeMap.get(currentNode.id) ?? [];
        const edge  = edges.find((e) => e.sourceHandle === (result ? "yes" : "no"))
                   ?? edges.find((e) => !e.sourceHandle);
        nextNodeId = edge?.target ?? null;

      // ── Branch (variable match) ───────────────────────────────────────────
      } else if (currentNode.type === "branch") {
        const data   = currentNode.data as BranchNodeData;
        const actual = String(mutableCtx.variables[data.variable] ?? "");
        const matched = actual.toLowerCase() === data.matchValue.toLowerCase();
        await log(currentNode.id, "branch", "info",
          `Branch: ${data.variable}="${actual}" ${matched ? "==" : "!="} "${data.matchValue}"`,
          { variable: data.variable, actual, matchValue: data.matchValue, matched }
        );

        const edges = edgeMap.get(currentNode.id) ?? [];
        const edge  = edges.find((e) => e.sourceHandle === (matched ? "yes" : "no"))
                   ?? edges.find((e) => !e.sourceHandle);
        nextNodeId = edge?.target ?? null;

      // ── Delay (standalone delay node) ────────────────────────────────────
      } else if (currentNode.type === "delay") {
        const data = currentNode.data as DelayNodeData;
        const edges = edgeMap.get(currentNode.id) ?? [];
        const continueNodeId = edges[0]?.target ?? null;

        if (continueNodeId) {
          await scheduleWait({
            ctx:        mutableCtx,
            nodeId:     currentNode.id,
            durationMs: data.durationMs,
            nextNodeId: continueNodeId,
          });
          await log(currentNode.id, "delay", "info",
            `Delay: ${humanMs(data.durationMs)} — continuará en nodo ${continueNodeId}`);
        }
        // Suspend — scheduled processor will resume
        break;

      // ── Action ────────────────────────────────────────────────────────────
      } else if (currentNode.type === "action") {
        const data = currentNode.data as ActionNodeData;

        // wait_delay embedded in an action node
        if (data.action.type === "wait_delay") {
          const edges = edgeMap.get(currentNode.id) ?? [];
          const continueNodeId = edges[0]?.target ?? null;
          if (continueNodeId) {
            await scheduleWait({
              ctx:        mutableCtx,
              nodeId:     currentNode.id,
              durationMs: data.action.durationMs,
              nextNodeId: continueNodeId,
            });
            await log(currentNode.id, "action", "info",
              `wait_delay: ${humanMs(data.action.durationMs)}`);
          }
          break;
        }

        // end_workflow terminates without error
        if (data.action.type === "end_workflow") {
          await log(currentNode.id, "action", "info", "Workflow finalizado por nodo end_workflow");
          break;
        }

        const makeLogger = (nodeId: string, nodeType: string) =>
          (level: LogLevel, message: string, logData?: Record<string, unknown>) =>
            log(nodeId, nodeType, level, message, logData);

        const result = await executeAction(
          data.action,
          mutableCtx,
          makeLogger(currentNode.id, "action")
        );

        // Merge output variables (e.g. intent classification result)
        if (result.variables) {
          mutableCtx.variables = { ...mutableCtx.variables, ...result.variables };
          // Persist variable state after every action that produces output
          await db
            .from("automation_executions")
            .update({ context: mutableCtx.variables as unknown as import("@/types/supabase").Json })
            .eq("id", executionId);
        }

        if (!result.ok) {
          await log(currentNode.id, "action", "warn",
            `Acción ${data.action.type} falló (non-fatal): ${result.error ?? "unknown"}`);
          // Non-fatal — continue to next node
        }

        // After dispatching trigger-producing actions, fire side-effect dispatchers
        await dispatchActionSideEffects(data.action, mutableCtx);

        const edges = edgeMap.get(currentNode.id) ?? [];
        nextNodeId = edges[0]?.target ?? null;

      // ── Trigger node (only used as entry — no work) ───────────────────────
      } else if (currentNode.type === "trigger") {
        const edges = edgeMap.get(currentNode.id) ?? [];
        nextNodeId = edges[0]?.target ?? null;
      }

      currentNode = nextNodeId ? nodeMap.get(nextNodeId) : undefined;
    }

    // ── Mark completed ───────────────────────────────────────────────────────
    await db.from("automation_executions").update({
      status:       "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", executionId);

    // ── Increment automation stats ────────────────────────────────────────────
    const { data: autoRow } = await db
      .from("automations")
      .select("execution_count")
      .eq("id", mutableCtx.automationId)
      .single();

    await db.from("automations").update({
      execution_count:   (autoRow?.execution_count ?? 0) + 1,
      last_triggered_at: new Date().toISOString(),
    }).eq("id", mutableCtx.automationId);

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[engine] Execution ${executionId} threw:`, message);
    await markFailed(db, executionId, message);
  }
}

// ─── Side-effect dispatchers ──────────────────────────────────────────────────

import type { ActionConfig } from "@/types/automation";

async function dispatchActionSideEffects(
  action: ActionConfig,
  ctx: ExecutionContext
): Promise<void> {
  try {
    const { dispatchTagAdded, dispatchTagRemoved, dispatchStatusChanged } =
      await import("./trigger-dispatcher");

    if (action.type === "add_tag" && ctx.contactId && ctx.conversationId) {
      void dispatchTagAdded({
        userId:         ctx.userId,
        contactId:      ctx.contactId,
        conversationId: ctx.conversationId,
        tag:            action.tag,
      });
    }

    if (action.type === "remove_tag" && ctx.contactId && ctx.conversationId) {
      void dispatchTagRemoved({
        userId:         ctx.userId,
        contactId:      ctx.contactId,
        conversationId: ctx.conversationId,
        tag:            action.tag,
      });
    }

    if (action.type === "update_status" && ctx.conversationId) {
      void dispatchStatusChanged({
        userId:         ctx.userId,
        conversationId: ctx.conversationId,
        fromStatus:     String(ctx.variables["conversation.status"] ?? "open"),
        toStatus:       action.status,
      });
    }
  } catch {
    // Side-effect dispatch is best-effort — never break the main execution
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function followEdge(
  from: WorkflowNode,
  edgeMap: Map<string, WorkflowEdge[]>,
  nodeMap: Map<string, WorkflowNode>
): WorkflowNode | undefined {
  const edge = (edgeMap.get(from.id) ?? [])[0];
  return edge ? nodeMap.get(edge.target) : undefined;
}

async function markFailed(
  db: ReturnType<typeof createAdminClient>,
  executionId: string,
  error: string
): Promise<void> {
  await db
    .from("automation_executions")
    .update({ status: "failed", error, completed_at: new Date().toISOString() })
    .eq("id", executionId);
}

function humanMs(ms: number): string {
  if (ms < 60_000)    return `${Math.round(ms / 1_000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}min`;
  return `${Math.round(ms / 3_600_000)}h`;
}
