// POST /api/billing/portal
// Creates a Stripe Customer Portal session for managing subscriptions/invoices.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPortalSession } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { workspaceId } = await req.json() as { workspaceId: string };

  const db = createAdminClient();
  const { data: workspace } = await db
    .from("workspaces")
    .select("stripe_customer_id")
    .eq("id", workspaceId)
    .eq("owner_id", user.id)
    .single();

  if (!workspace?.stripe_customer_id) {
    return NextResponse.json({ error: "No active subscription found" }, { status: 400 });
  }

  const origin    = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const returnUrl = `${origin}/settings/billing`;

  const url = await createPortalSession({
    stripeCustomerId: workspace.stripe_customer_id,
    returnUrl,
  });

  return NextResponse.json({ url });
}
