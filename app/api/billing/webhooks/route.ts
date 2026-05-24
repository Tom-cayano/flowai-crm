// POST /api/billing/webhooks
// Receives and verifies Stripe webhook events.
// Must use the raw body — no JSON parsing before signature verification.

import { NextRequest, NextResponse } from "next/server";
import { constructWebhookEvent } from "@/lib/billing/stripe";
import { handleStripeWebhook } from "@/lib/billing/webhooks";
import { createLogger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

const log = createLogger("billing:webhook-route");

export async function POST(req: NextRequest) {
  const rawBody  = await req.text();
  const sigHeader = req.headers.get("stripe-signature");

  if (!sigHeader) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event;
  try {
    event = constructWebhookEvent(rawBody, sigHeader);
  } catch (err) {
    log.warn("Stripe webhook signature verification failed", { err: String(err) });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    await handleStripeWebhook(event);
    return NextResponse.json({ received: true });
  } catch (err) {
    log.error("Stripe webhook handler failed", { err: String(err), eventType: event.type });
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
