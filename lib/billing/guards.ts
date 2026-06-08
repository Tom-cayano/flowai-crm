// Feature, plan, and quota guards — server-only.
// Import in API routes and Server Actions; NEVER in Client Components.
// All functions throw BillingError on violation so callers can catch and
// return an appropriate HTTP response without duplicating logic.

import { getWorkspaceSubscription } from "./subscriptions";
import { isWithinQuota } from "./usage";
import { planHasFeature } from "./plans";
import type { PlanFeature, PlanId } from "@/types/billing";

export class BillingError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BillingError";
    this.code = code;
  }
}

// Map plan IDs to a comparable rank so we can do "at least Pro" checks.
const PLAN_RANK: Record<string, number> = {
  starter:    0,
  pro:        1,
  agency:     2,
  enterprise: 3,
};

// ─── assertFeature ────────────────────────────────────────────────────────────
// Throws if the workspace plan does not include `feature`, or if the
// subscription is canceled / unpaid (hard-blocked, not just degraded).

export async function assertFeature(
  workspaceId: string,
  feature: PlanFeature
): Promise<void> {
  // Development bypass — PLAN_GATE_BYPASS=true unlocks all features including
  // the subscription existence check. We allow this in production if the admin
  // explicitly sets it, and we trim() to handle Vercel CLI trailing newlines.
  if (process.env.PLAN_GATE_BYPASS?.trim() === "true") {
    return;
  }

  const sub = await getWorkspaceSubscription(workspaceId);
  if (!sub) {
    throw new BillingError("NO_SUBSCRIPTION", "No se encontró suscripción activa.");
  }

  if (sub.status === "canceled" || sub.status === "unpaid") {
    throw new BillingError(
      "SUBSCRIPTION_INACTIVE",
      "La suscripción no está activa. Actualiza tu plan para continuar."
    );
  }

  if (!planHasFeature(sub.planId, feature)) {
    throw new BillingError(
      "FEATURE_NOT_AVAILABLE",
      `La funcionalidad "${feature}" no está disponible en el plan ${sub.plan.name}. Actualiza para continuar.`
    );
  }
}

// ─── assertPlan ───────────────────────────────────────────────────────────────
// Throws if the workspace is on a plan below minPlanId.

export async function assertPlan(
  workspaceId: string,
  minPlanId: PlanId
): Promise<void> {
  if (process.env.PLAN_GATE_BYPASS?.trim() === "true") {
    return;
  }

  const sub = await getWorkspaceSubscription(workspaceId);
  if (!sub) {
    throw new BillingError("NO_SUBSCRIPTION", "No se encontró suscripción activa.");
  }

  const currentRank  = PLAN_RANK[sub.planId]  ?? 0;
  const requiredRank = PLAN_RANK[minPlanId] ?? 0;

  if (currentRank < requiredRank) {
    throw new BillingError(
      "PLAN_INSUFFICIENT",
      `Esta acción requiere el plan ${minPlanId} o superior. Plan actual: ${sub.plan.name}.`
    );
  }
}

// ─── assertUsageLimit ─────────────────────────────────────────────────────────
// Throws if the workspace has exhausted its monthly quota for `resource`.

export async function assertUsageLimit(
  workspaceId: string,
  resource: "messages" | "ai_credits" | "automations"
): Promise<void> {
  if (process.env.PLAN_GATE_BYPASS?.trim() === "true") {
    return;
  }

  const ok = await isWithinQuota(workspaceId, resource);
  if (!ok) {
    throw new BillingError(
      "QUOTA_EXCEEDED",
      `Límite mensual de ${resource.replace("_", " ")} alcanzado. Actualiza tu plan para continuar.`
    );
  }
}

// ─── billingErrorToResponse ───────────────────────────────────────────────────
// Converts a BillingError to a { status, body } pair for NextResponse use.

export function billingErrorToResponse(err: BillingError): {
  status: number;
  body: { error: string; code: string };
} {
  const status =
    err.code === "NO_SUBSCRIPTION"      ? 404 :
    err.code === "QUOTA_EXCEEDED"       ? 429 :
    err.code === "SUBSCRIPTION_INACTIVE"? 402 :
    402; // FEATURE_NOT_AVAILABLE / PLAN_INSUFFICIENT

  return { status, body: { error: err.message, code: err.code } };
}
