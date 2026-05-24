// GET /api/billing/invoices?workspaceId=...
// Returns the 10 most recent Stripe invoices for the workspace.
// Requires the caller to own the workspace (owner_id check).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: workspace } = await db
    .from("workspaces")
    .select("stripe_customer_id")
    .eq("id", workspaceId)
    .eq("owner_id", user.id)
    .single();

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // No customer yet — return empty list (not an error; workspace may be on trial)
  if (!workspace.stripe_customer_id) {
    return NextResponse.json({ invoices: [] });
  }

  const stripe = getStripe();
  const { data: invoices } = await stripe.invoices.list({
    customer: workspace.stripe_customer_id,
    limit:    10,
  });

  const mapped = invoices.map((inv) => ({
    id:                inv.id,
    number:            inv.number,
    status:            inv.status,
    amountPaid:        inv.amount_paid,
    amountDue:         inv.amount_due,
    currency:          inv.currency,
    created:           inv.created,
    hostedInvoiceUrl:  inv.hosted_invoice_url,
    invoicePdf:        inv.invoice_pdf,
    periodStart:       inv.period_start,
    periodEnd:         inv.period_end,
  }));

  return NextResponse.json({ invoices: mapped });
}
