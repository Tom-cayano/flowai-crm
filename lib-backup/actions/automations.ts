"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserPrimaryWorkspace } from "@/lib/rbac/permissions";
import { checkAutomationLimit } from "@/lib/billing/limits";
import type { WorkflowGraph, AutomationRecord, AutomationStatus2 } from "@/types/automation";

type Ok<T> = { data: T; error: null };
type Err   = { data: null; error: string };
type Result<T> = Ok<T> | Err;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractTriggerType(workflow: WorkflowGraph): string | null {
  const triggerNode = workflow.nodes.find((n) => n.type === "trigger");
  if (!triggerNode || triggerNode.data.nodeType !== "trigger") return null;
  return triggerNode.data.config.type;
}

function rowToRecord(row: {
  id: string;
  user_id: string;
  name: string;
  description: string;
  status: string;
  workflow: unknown;
  trigger_type: string | null;
  execution_count: number;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
}): AutomationRecord {
  return {
    id:              row.id,
    userId:          row.user_id,
    name:            row.name,
    description:     row.description,
    status:          row.status as AutomationStatus2,
    workflow:        row.workflow as unknown as WorkflowGraph,
    executionCount:  row.execution_count,
    lastTriggeredAt: row.last_triggered_at,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getAutomations(): Promise<Result<AutomationRecord[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  const { data, error } = await supabase
    .from("automations")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) return { data: null, error: error.message };
  return { data: (data ?? []).map(rowToRecord), error: null };
}

export async function getAutomation(id: string): Promise<Result<AutomationRecord>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  const { data, error } = await supabase
    .from("automations")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error) return { data: null, error: error.message };
  return { data: rowToRecord(data), error: null };
}

export async function getExecutionLogs(automationId: string, limit = 20): Promise<Result<{
  executions: Array<{
    id: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    error: string | null;
    conversationId: string | null;
    logs: Array<{ nodeId: string; nodeType: string; level: string; message: string; createdAt: string }>;
  }>;
}>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  const { data: execs, error } = await supabase
    .from("automation_executions")
    .select("id, status, started_at, completed_at, error, conversation_id")
    .eq("automation_id", automationId)
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) return { data: null, error: error.message };

  const executions = await Promise.all(
    (execs ?? []).map(async (exec) => {
      const { data: logs } = await supabase
        .from("automation_step_logs")
        .select("node_id, node_type, level, message, created_at")
        .eq("execution_id", exec.id)
        .order("created_at", { ascending: true });

      return {
        id:             exec.id,
        status:         exec.status,
        startedAt:      exec.started_at,
        completedAt:    exec.completed_at,
        error:          exec.error,
        conversationId: exec.conversation_id,
        logs: (logs ?? []).map((l) => ({
          nodeId:    l.node_id,
          nodeType:  l.node_type,
          level:     l.level,
          message:   l.message,
          createdAt: l.created_at,
        })),
      };
    })
  );

  return { data: { executions }, error: null };
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function createAutomation(payload: {
  name: string;
  description?: string;
  workflow?: WorkflowGraph;
}): Promise<Result<AutomationRecord>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  if (!payload.name.trim()) return { data: null, error: "El nombre es obligatorio" };

  // ── Automation count limit ─────────────────────────────────────────────────
  const workspaceId = await getUserPrimaryWorkspace(user.id);
  if (workspaceId) {
    const limitCheck = await checkAutomationLimit(workspaceId, user.id);
    if (!limitCheck.ok) {
      return {
        data:  null,
        error: `Límite de automatizaciones alcanzado (${limitCheck.current}/${limitCheck.limit}) en el plan ${limitCheck.planName}. Actualiza para crear más.`,
      };
    }
  }

  const workflow: WorkflowGraph = payload.workflow ?? {
    nodes: [], edges: [], version: 1,
  };

  const { data, error } = await supabase
    .from("automations")
    .insert({
      user_id:      user.id,
      name:         payload.name.trim(),
      description:  payload.description?.trim() ?? "",
      workflow:     workflow as unknown as import("@/types/supabase").Json,
      trigger_type: extractTriggerType(workflow),
      status:       "draft",
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/automations");
  return { data: rowToRecord(data), error: null };
}

export async function updateAutomationWorkflow(
  id: string,
  workflow: WorkflowGraph
): Promise<Result<void>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  const { error } = await supabase
    .from("automations")
    .update({
      workflow:     workflow as unknown as import("@/types/supabase").Json,
      trigger_type: extractTriggerType(workflow),
      updated_at:   new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { data: null, error: error.message };
  revalidatePath("/automations");
  revalidatePath(`/automations/${id}`);
  return { data: undefined, error: null };
}

export async function updateAutomationMeta(
  id: string,
  meta: { name?: string; description?: string }
): Promise<Result<void>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  const { error } = await supabase
    .from("automations")
    .update({ ...meta, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { data: null, error: error.message };
  revalidatePath("/automations");
  return { data: undefined, error: null };
}

export async function toggleAutomationStatus(
  id: string,
  status: AutomationStatus2
): Promise<Result<void>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  const { error } = await supabase
    .from("automations")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { data: null, error: error.message };
  revalidatePath("/automations");
  return { data: undefined, error: null };
}

export async function deleteAutomation(id: string): Promise<Result<void>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  const { error } = await supabase
    .from("automations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { data: null, error: error.message };
  revalidatePath("/automations");
  return { data: undefined, error: null };
}

export async function duplicateAutomation(id: string): Promise<Result<AutomationRecord>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  const { data: source, error: fetchErr } = await supabase
    .from("automations")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !source) return { data: null, error: "Automatización no encontrada" };

  const { data, error } = await supabase
    .from("automations")
    .insert({
      user_id:      user.id,
      name:         `${source.name} (copia)`,
      description:  source.description,
      workflow:     source.workflow,
      trigger_type: source.trigger_type,
      status:       "draft",
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  revalidatePath("/automations");
  return { data: rowToRecord(data), error: null };
}

// ─── Execution control ────────────────────────────────────────────────────────

export async function cancelAutomationExecution(
  executionId: string
): Promise<Result<void>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "No autenticado" };

  const { data: exec } = await supabase
    .from("automation_executions")
    .select("id, automation_id")
    .eq("id", executionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!exec) return { data: null, error: "Ejecución no encontrada" };

  const { cancelExecution } = await import("@/lib/automation/execution-guard");
  await cancelExecution(executionId);

  revalidatePath(`/automations/${exec.automation_id}`);
  return { data: undefined, error: null };
}
