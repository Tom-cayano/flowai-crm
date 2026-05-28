// Onboarding progress tracking — read and update wizard completion state.

import { createAdminClient } from "@/lib/supabase/admin";
import type { OnboardingProgress } from "@/types/workspace";
import type { Database } from "@/types/supabase";

type OnboardingUpdate = Database["public"]["Tables"]["onboarding_progress"]["Update"];

export type OnboardingStep =
  | "whatsapp_connected"
  | "first_message_sent"
  | "ai_configured"
  | "team_member_invited"
  | "automation_created"
  | "billing_setup";

export interface OnboardingItem {
  key:         OnboardingStep;
  label:       string;
  description: string;
  href:        string;
  completed:   boolean;
}

// ─── Get progress ─────────────────────────────────────────────

export async function getOnboardingProgress(
  workspaceId: string
): Promise<OnboardingProgress | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("onboarding_progress")
    .select("*")
    .eq("workspace_id", workspaceId)
    .single();

  if (!data) return null;

  return {
    workspaceId:          data.workspace_id,
    whatsappConnected:    data.whatsapp_connected,
    firstMessageSent:     data.first_message_sent,
    aiConfigured:         data.ai_configured,
    teamMemberInvited:    data.team_member_invited,
    automationCreated:    data.automation_created,
    billingSetup:         data.billing_setup,
    wizardCompleted:      data.wizard_completed,
    wizardDismissed:      data.wizard_dismissed,
    currentStep:          data.current_step,
    completedAt:          data.completed_at,
  };
}

// ─── Mark a step complete ─────────────────────────────────────

export async function completeOnboardingStep(
  workspaceId: string,
  step:        OnboardingStep
): Promise<void> {
  const db     = createAdminClient();
  const column = step; // column names match step keys
  const update: Record<string, unknown> = {
    [column]: true,
    updated_at: new Date().toISOString(),
  };

  // Check if all steps will be complete
  const { data: current } = await db
    .from("onboarding_progress")
    .select("*")
    .eq("workspace_id", workspaceId)
    .single();

  if (current) {
    const allComplete = [
      "whatsapp_connected",
      "first_message_sent",
      "ai_configured",
      "team_member_invited",
      "automation_created",
      "billing_setup",
    ].every((s) => s === column || Boolean(current[s as keyof typeof current]));

    if (allComplete) {
      update.wizard_completed = true;
      update.completed_at     = new Date().toISOString();
    }
  }

  await db
    .from("onboarding_progress")
    .update(update as unknown as OnboardingUpdate)
    .eq("workspace_id", workspaceId);
}

// ─── Dismiss wizard ───────────────────────────────────────────

export async function dismissWizard(workspaceId: string): Promise<void> {
  const db = createAdminClient();
  await db
    .from("onboarding_progress")
    .update({ wizard_dismissed: true, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId);
}

// ─── Build checklist items (for UI) ──────────────────────────

export function buildChecklist(progress: OnboardingProgress): OnboardingItem[] {
  return [
    {
      key:         "whatsapp_connected",
      label:       "Conectar WhatsApp",
      description: "Vincula tu número de WhatsApp Business para comenzar a recibir mensajes.",
      href:        "/settings?tab=integrations",
      completed:   progress.whatsappConnected,
    },
    {
      key:         "first_message_sent",
      label:       "Enviar primer mensaje",
      description: "Envía tu primer mensaje de prueba desde el inbox.",
      href:        "/conversations",
      completed:   progress.firstMessageSent,
    },
    {
      key:         "ai_configured",
      label:       "Configurar el asistente IA",
      description: "Activa y personaliza las respuestas automáticas de IA.",
      href:        "/settings?tab=ai",
      completed:   progress.aiConfigured,
    },
    {
      key:         "team_member_invited",
      label:       "Invitar un miembro del equipo",
      description: "Añade a tu primer compañero de trabajo al workspace.",
      href:        "/settings/team",
      completed:   progress.teamMemberInvited,
    },
    {
      key:         "automation_created",
      label:       "Crear una automatización",
      description: "Configura tu primer flujo de automatización.",
      href:        "/automations",
      completed:   progress.automationCreated,
    },
    {
      key:         "billing_setup",
      label:       "Configurar facturación",
      description: "Activa tu suscripción para no perder acceso al final del período de prueba.",
      href:        "/settings/billing",
      completed:   progress.billingSetup,
    },
  ];
}

// Completion percentage
export function getCompletionPct(progress: OnboardingProgress): number {
  const steps = [
    progress.whatsappConnected,
    progress.firstMessageSent,
    progress.aiConfigured,
    progress.teamMemberInvited,
    progress.automationCreated,
    progress.billingSetup,
  ];
  const done = steps.filter(Boolean).length;
  return Math.round((done / steps.length) * 100);
}
