// Stripe webhook handler logic — called from the /api/billing/webhooks route.
// Maps Stripe events to subscription state changes in the database.
//
// IDEMPOTENCY: Every Stripe event has a unique `id`. We check
// billing_events.stripe_event_id (UNIQUE constraint) BEFORE running any sync.
// This means Stripe retries are safely ignored without double-processing.

import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncSubscriptionFromStripe, recordBillingEvent } from "./subscriptions";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("billing:webhooks");

// Stripe price ID → plan ID mapping (configure in env)
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
// Returns true if the event was already processed (billing_events UNIQUE on
// stripe_event_id). Callers must return early when this is true.

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

  // Idempotency — skip if we've already processed this event.
  // Stripe retries on 5xx, so this protects against double-processing.
  if (await isAlreadyProcessed(event.id)) {
    log.info("skipping duplicate stripe event", { eventId: event.id, type: event.type });
    return;
  }

  switch (event.type) {

    // ── Checkout completed ────────────────────────────────────────────────────
    // Associates the Stripe customer with the workspace if not already done.
    // The subscription data itself arrives via customer.subscription.created.
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.metadata?.workspace_id;

      if (!workspaceId) {
        log.warn("checkout.session.completed missing workspace_id in metadata", {
          sessionId: session.id,
        });
        return;
      }

      if (session.customer) {
        await syncSubscriptionFromStripe({
          workspaceId,
          stripeCustomerId: session.customer as string,
          // subscription_id comes from customer.subscription.created — don't duplicate
        });
      }

      await recordBillingEvent({
        workspaceId,
        eventType:      event.type,
        stripeEventId:  event.id,
        payload:        {
          session_id:   session.id,
          customer:     session.customer,
          subscription: session.subscription,
          mode:         session.mode,
        },
      });
      break;
    }

    // ── Subscription created / updated ────────────────────────────────────────
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const workspaceId = (sub.metadata?.workspace_id as string | undefined)
        ?? await getWorkspaceByCustomer(sub.customer as string);

      if (!workspaceId) {
        log.warn("no workspace found for subscription", { subscriptionId: sub.id });
        return;
      }

      const item      = sub.items.data[0];
      const priceId   = item?.price.id ?? "";
      const interval  = item?.price.recurring?.interval ?? "month";
      // In API version ≥ 2026-04-22 current_period_end lives on SubscriptionItem
      const periodEnd = item?.current_period_end;
      const planId    = resolvePlanId(priceId);

      await syncSubscriptionFromStripe({
        workspaceId,
        planId,
        status:               sub.status,
        stripeCustomerId:     sub.customer as string,
        stripeSubscriptionId: sub.id,
        currentPeriodEnd:     periodEnd ? new Date(periodEnd * 1000) : null,
        trialEndsAt:          sub.trial_end ? new Date(sub.trial_end * 1000) : null,
        billingInterval:      interval === "year" ? "yearly" : "monthly",
      });

      // On downgrade, clear the grace period since we now have a clean state
      if (event.type === "customer.subscription.updated") {
        log.info("subscription updated", {
          workspaceId,
          newPlan:  planId,
          status:   sub.status,
          interval,
        });
      }

      await recordBillingEvent({
        workspaceId,
        eventType:      event.type,
        stripeEventId:  event.id,
        payload:        { subscription_id: sub.id, status: sub.status, plan: planId },
      });
      break;
    }

    // ── Subscription deleted (canceled) ───────────────────────────────────────
    // Downgrade to starter + set grace period (7 days to let customers fix payment).
    case "customer.subscription.deleted": {
      const sub         = event.data.object as Stripe.Subscription;
      const workspaceId = await getWorkspaceBySubscription(sub.id);

      if (workspaceId) {
        const gracePeriodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await syncSubscriptionFromStripe({
          workspaceId,
          status:          "canceled",
          planId:          "starter",
          currentPeriodEnd: gracePeriodEnd,
        });

        // Write grace period to workspaces table
        const db = createAdminClient();
        await db
          .from("workspaces")
          .update({ grace_period_ends_at: gracePeriodEnd.toISOString() })
          .eq("id", workspaceId);

        await recordBillingEvent({
          workspaceId,
          eventType:     event.type,
          stripeEventId: event.id,
          payload:       { subscription_id: sub.id, cancellation_reason: sub.cancellation_details?.reason ?? null },
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
      const inv         = event.data.object as Stripe.Invoice;
      const workspaceId = await getWorkspaceByCustomer(inv.customer as string);

      if (workspaceId) {
        // Clear grace period and reactivate if it was past_due
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
          payload:       { amount_paid: inv.amount_paid, invoice_id: inv.id, invoice_number: inv.number },
        });
      }
      break;
    }

    // ── Invoice payment failed ────────────────────────────────────────────────
    case "invoice.payment_failed": {
      const inv         = event.data.object as Stripe.Invoice;
      const workspaceId = await getWorkspaceByCustomer(inv.customer as string);

      if (workspaceId) {
        await syncSubscriptionFromStripe({ workspaceId, status: "past_due" });
        await recordBillingEvent({
          workspaceId,
          eventType:     event.type,
          stripeEventId: event.id,
          payload:       {
            invoice_id:      inv.id,
            attempt_count:   inv.attempt_count,
            next_payment_attempt: inv.next_payment_attempt,
          },
        });

        log.warn("invoice payment failed", {
          workspaceId,
          invoiceId:    inv.id,
          attemptCount: inv.attempt_count,
        });
      }
      break;
    }

    // ── Trial ending soon (3 days before) ────────────────────────────────────
    // Record the event so it can trigger email notifications via a job queue.
    case "customer.subscription.trial_will_end": {
      const sub = event.data.object as Stripe.Subscription;
      const workspaceId = (sub.metadata?.workspace_id as string | undefined)
        ?? await getWorkspaceByCustomer(sub.customer as string);

      if (workspaceId) {
        const daysRemaining = sub.trial_end
          ? Math.ceil((sub.trial_end * 1000 - Date.now()) / (1000 * 60 * 60 * 24))
          : 0;

        await recordBillingEvent({
          workspaceId,
          eventType:     event.type,
          stripeEventId: event.id,
          payload:       {
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
