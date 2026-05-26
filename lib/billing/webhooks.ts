// Stripe webhook handler logic — called from the /api/billing/webhooks route.
// Maps Stripe events to subscription state changes in the database.
//
// IDEMPOTENCY: Every Stripe event has a unique `id`. We check
// billing_events.stripe_event_id (UNIQUE constraint) BEFORE running any sync.
// This means Stripe retries are safely ignored without double-processing.
//
// TYPE NOTES (stripe@22 / API 2026-04-22.dahlia):
//   - event.data.object is Record<string,unknown> — requires `as unknown as Stripe.X`
//   - Invoice/Subscription.customer is string|Customer|DeletedCustomer — use extractCustomerId()
//   - next_payment_attempt removed from Stripe.Invoice in 2026-04-22.dahlia
//   - SubscriptionItem.current_period_end requires explicit cast for TS compatibility

import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncSubscriptionFromStripe, recordBillingEvent } from "./subscriptions";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("billing:webhooks");

// ─── Stripe price ID → plan ID mapping ───────────────────────────────────────

function resolvePlanId(priceId: string): string {
  const map: Record<string, string> = {
    [process.env.STRIPE_PRICE_STARTER_MONTHLY  ?? "price_starter_m"]:  "starter",
    [process.env.STRIPE_PRICE_STARTER_YEARLY   ?? "price_starter_y"]:  "starter",
    [process.env.STRIPE_PRICE_PRO_MONTHLY      ?? "price_pro_m"]:      "pro",
    [process.env.STRIPE_PRICE_PRO_YEARLY       ?? "price_pro_y"]:      "pro",
    [process.env.STRIPE_PRICE_AGENCY_MONTHLY   ?? "price_agency_m"]:   "agency",
    [process.env.STRIPE_PRICE_AGENCY_YEARLY    ?? "price_agency_y"]:   "agency",
  };
  return map[priceId] ?? "starter";
}

// ─── Type helpers ─────────────────────────────────────────────────────────────

/**
 * Stripe.Invoice.customer and Stripe.Subscription.customer are both
 * `string | Stripe.Customer | Stripe.DeletedCustomer | null` in SDK v22.
 * This helper always returns the plain string ID.
 */
function extractCustomerId(
  customer:
    | string
    | Stripe.Customer
    | Stripe.DeletedCustomer
    | null
    | undefined,
): string | null {
  if (typeof customer === "string") return customer;
  if (customer && typeof customer === "object" && "id" in customer) return customer.id;
  return null;
}

// ─── DB lookups ───────────────────────────────────────────────────────────────

async function getWorkspaceByCustomer(customerId: string): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("workspaces")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.id ?? null;
}

async function getWorkspaceBySubscription(subscriptionId: string): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("workspaces")
    .select("id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  return data?.id ?? null;
}

// ─── Idempotency guard ────────────────────────────────────────────────────────

async function isAlreadyProcessed(eventId: string): Promise<boolean> {
  const db = createAdminClient();
  const { data } = await db
    .from("billing_events")
    .select("id")
    .eq("stripe_event_id", eventId)
    .maybeSingle();
  return data !== null;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handleStripeWebhook(event: Stripe.Event): Promise<void> {
  log.info("stripe webhook received", { type: event.type, eventId: event.id });

  if (await isAlreadyProcessed(event.id)) {
    log.info("skipping duplicate stripe event", { eventId: event.id, type: event.type });
    return;
  }

  switch (event.type) {

    // ── Checkout completed ────────────────────────────────────────────────────
    case "checkout.session.completed": {
      // SDK v22: event.data.object is Record<string,unknown> — double-cast required
      const session = event.data.object as unknown as Stripe.Checkout.Session;
      const workspaceId = session.metadata?.workspace_id;

      if (!workspaceId) {
        log.warn("checkout.session.completed missing workspace_id in metadata", {
          sessionId: session.id,
        });
        return;
      }

      const customerId = extractCustomerId(session.customer);
      if (customerId) {
        await syncSubscriptionFromStripe({
          workspaceId,
          stripeCustomerId: customerId,
        });
      }

      await recordBillingEvent({
        workspaceId,
        eventType:     event.type,
        stripeEventId: event.id,
        payload: {
          session_id:   session.id,
          customer:     extractCustomerId(session.customer),
          subscription: session.subscription,
          mode:         session.mode,
        },
      });
      break;
    }

    // ── Subscription created / updated ────────────────────────────────────────
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as unknown as Stripe.Subscription;
      const customerId  = extractCustomerId(sub.customer);
      const workspaceId = (sub.metadata?.workspace_id as string | undefined)
        ?? (customerId ? await getWorkspaceByCustomer(customerId) : null);

      if (!workspaceId) {
        log.warn("no workspace found for subscription", { subscriptionId: sub.id });
        return;
      }

      const item     = sub.items.data[0];
      const priceId  = item?.price.id ?? "";
      const interval = item?.price.recurring?.interval ?? "month";

      // In API 2025-01-27.acacia+ current_period_end lives on SubscriptionItem.
      // Cast through unknown to handle SDK type-generation lag for this property.
      const periodEnd = item
        ? (item as unknown as { current_period_end?: number }).current_period_end
        : undefined;

      const planId = resolvePlanId(priceId);

      await syncSubscriptionFromStripe({
        workspaceId,
        planId,
        status:               sub.status,
        stripeCustomerId:     customerId ?? undefined,
        stripeSubscriptionId: sub.id,
        currentPeriodEnd:     periodEnd ? new Date(periodEnd * 1000) : null,
        trialEndsAt:          sub.trial_end ? new Date(sub.trial_end * 1000) : null,
        billingInterval:      interval === "year" ? "yearly" : "monthly",
      });

      if (event.type === "customer.subscription.updated") {
        log.info("subscription updated", {
          workspaceId, newPlan: planId, status: sub.status, interval,
        });
      }

      await recordBillingEvent({
        workspaceId,
        eventType:     event.type,
        stripeEventId: event.id,
        payload:       { subscription_id: sub.id, status: sub.status, plan: planId },
      });
      break;
    }

    // ── Subscription deleted (canceled) ───────────────────────────────────────
    case "customer.subscription.deleted": {
      const sub         = event.data.object as unknown as Stripe.Subscription;
      const workspaceId = await getWorkspaceBySubscription(sub.id);

      if (workspaceId) {
        const gracePeriodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await syncSubscriptionFromStripe({
          workspaceId,
          status:           "canceled",
          planId:           "starter",
          currentPeriodEnd: gracePeriodEnd,
        });

        const db = createAdminClient();
        await db
          .from("workspaces")
          .update({ grace_period_ends_at: gracePeriodEnd.toISOString() })
          .eq("id", workspaceId);

        // cancellation_details.reason is a string | null in SDK v22
        const cancelReason =
          (sub.cancellation_details as { reason?: string | null } | null | undefined)
            ?.reason ?? null;

        await recordBillingEvent({
          workspaceId,
          eventType:     event.type,
          stripeEventId: event.id,
          payload:       { subscription_id: sub.id, cancellation_reason: cancelReason },
        });

        log.info("subscription canceled — grace period set", {
          workspaceId,
          gracePeriodEnd: gracePeriodEnd.toISOString(),
        });
      }
      break;
    }

    // ── Invoice paid ──────────────────────────────────────────────────────────
    case "invoice.paid": {
      const inv         = event.data.object as unknown as Stripe.Invoice;
      const customerId  = extractCustomerId(inv.customer);
      const workspaceId = customerId ? await getWorkspaceByCustomer(customerId) : null;

      if (workspaceId) {
        const db = createAdminClient();
        await db
          .from("workspaces")
          .update({ grace_period_ends_at: null })
          .eq("id", workspaceId);

        await syncSubscriptionFromStripe({ workspaceId, status: "active" });
        await recordBillingEvent({
          workspaceId,
          eventType:     event.type,
          stripeEventId: event.id,
          payload: {
            amount_paid:    inv.amount_paid,
            invoice_id:     inv.id,
            invoice_number: inv.number,
          },
        });
      }
      break;
    }

    // ── Invoice payment failed ────────────────────────────────────────────────
    case "invoice.payment_failed": {
      const inv         = event.data.object as unknown as Stripe.Invoice;
      const customerId  = extractCustomerId(inv.customer);
      const workspaceId = customerId ? await getWorkspaceByCustomer(customerId) : null;

      if (workspaceId) {
        await syncSubscriptionFromStripe({ workspaceId, status: "past_due" });

        // attempt_count exists on Invoice in all API versions.
        // next_payment_attempt was removed in 2026-04-22.dahlia — safe access via unknown.
        const invRecord = inv as unknown as Record<string, unknown>;

        await recordBillingEvent({
          workspaceId,
          eventType:     event.type,
          stripeEventId: event.id,
          payload: {
            invoice_id:           inv.id,
            attempt_count:        invRecord["attempt_count"] ?? null,
            next_payment_attempt: invRecord["next_payment_attempt"] ?? null,
          },
        });

        log.warn("invoice payment failed", {
          workspaceId,
          invoiceId:    inv.id,
          attemptCount: invRecord["attempt_count"],
        });
      }
      break;
    }

    // ── Trial ending soon ─────────────────────────────────────────────────────
    case "customer.subscription.trial_will_end": {
      const sub        = event.data.object as unknown as Stripe.Subscription;
      const customerId = extractCustomerId(sub.customer);
      const workspaceId = (sub.metadata?.workspace_id as string | undefined)
        ?? (customerId ? await getWorkspaceByCustomer(customerId) : null);

      if (workspaceId) {
        const daysRemaining = sub.trial_end
          ? Math.ceil((sub.trial_end * 1000 - Date.now()) / (1000 * 60 * 60 * 24))
          : 0;

        await recordBillingEvent({
          workspaceId,
          eventType:     event.type,
          stripeEventId: event.id,
          payload: {
            subscription_id: sub.id,
            trial_end:       sub.trial_end,
            days_remaining:  daysRemaining,
          },
        });

        log.info("trial ending soon", {
          workspaceId,
          daysRemaining,
          trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        });
      }
      break;
    }

    default:
      log.info("unhandled stripe event type", { type: event.type });
  }
}
