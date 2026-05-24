// POST /api/billing/checkout
// Creates a Stripe Checkout session and returns the redirect URL.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCheckoutSession, getOrCreateCustomer } from "@/lib/billing/stripe";
import { PLANS } from "@/lib/billing/plans";
import type { PlanId, BillingInterval } from "@/types/billing";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    planId:          PlanId;
    interval:        BillingInterval;
    workspaceId:     string;
  };

  const { planId, interval, workspaceId } = body;
  const plan = PLANS[planId];
  if (!plan) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  const priceId = interval === "yearly"
    ? process.env[`STRIPE_PRICE_${planId.toUpperCase()}_YEARLY`]
    : process.env[`STRIPE_PRICE_${planId.toUpperCase()}_MONTHLY`];

  if (!priceId) {
    return NextResponse.json({ error: "Price not configured for this plan" }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: workspace } = await db
    .from("workspaces")
    .select("stripe_customer_id, owner_id")
    .eq("id", workspaceId)
    .eq("owner_id", user.id)
    .single();

  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const customerId = await getOrCreateCustomer({
    email:       user.email!,
    name:        user.user_metadata?.full_name,
    workspaceId,
    existingId:  workspace.stripe_customer_id,
  });

  // Persist customer ID if newly created
  if (!workspace.stripe_customer_id) {
    await db
      .from("workspaces")
      .update({ stripe_customer_id: customerId })
      .eq("id", workspaceId);
  }

  const origin     = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const successUrl = `${origin}/settings/billing?session_id={CHECKOUT_SESSION_ID}&success=1`;
  const cancelUrl  = `${origin}/settings/billing?canceled=1`;

  const url = await createCheckoutSession({
    workspaceId,
    stripeCustomerId: customerId,
    priceId,
    successUrl,
    cancelUrl,
    trialDays: workspace.stripe_customer_id ? undefined : 14,
  });

  return NextResponse.json({ url });
}
