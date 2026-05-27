// Stripe client singleton — server-only.
// Never import this from Client Components.

import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
    // Sin apiVersion explícita — el SDK usa su versión bundled por defecto.
    // Evita incompatibilidades cuando el SDK actualiza su pinned version.
    _stripe = new Stripe(key);
  }
  return _stripe;
}

// ─── Checkout session ─────────────────────────────────────────

export async function createCheckoutSession(opts: {
  workspaceId:        string;
  stripeCustomerId:   string | null;
  priceId:            string;
  successUrl:         string;
  cancelUrl:          string;
  trialDays?:         number;
}): Promise<string> {
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode:                "subscription",
    payment_method_types: ["card"],
    customer:            opts.stripeCustomerId ?? undefined,
    line_items: [{ price: opts.priceId, quantity: 1 }],
    success_url:         opts.successUrl,
    cancel_url:          opts.cancelUrl,
    allow_promotion_codes: true,
    subscription_data: {
      trial_period_days: opts.trialDays,
      metadata:          { workspace_id: opts.workspaceId },
    },
    metadata: { workspace_id: opts.workspaceId },
  });

  return session.url!;
}

// ─── Customer portal ──────────────────────────────────────────

export async function createPortalSession(opts: {
  stripeCustomerId: string;
  returnUrl:        string;
}): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer:   opts.stripeCustomerId,
    return_url: opts.returnUrl,
  });
  return session.url;
}

// ─── Create or retrieve Stripe customer ───────────────────────

export async function getOrCreateCustomer(opts: {
  email:       string;
  name?:       string;
  workspaceId: string;
  existingId?: string | null;
}): Promise<string> {
  const stripe = getStripe();

  if (opts.existingId) {
    return opts.existingId;
  }

  const customer = await stripe.customers.create({
    email:    opts.email,
    name:     opts.name,
    metadata: { workspace_id: opts.workspaceId },
  });

  return customer.id;
}

// ─── Construct webhook event ──────────────────────────────────

export function constructWebhookEvent(
  rawBody: string | Buffer,
  signature: string
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  return getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
}
