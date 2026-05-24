-- ============================================================
-- Stripe Billing Additions
-- ============================================================
-- Extends the existing SaaS schema with:
--   • grace_period_ends_at on workspaces (7-day window after cancellation)
--   • set_seat_count RPC (absolute value, complements increment_usage)
--   • Index on billing_events(stripe_event_id) for idempotency lookups
-- ============================================================

-- ─── Grace period for canceled subscriptions ─────────────────
-- When a subscription is canceled or payment fails we grant a 7-day grace
-- period before revoking premium features. DashboardShell reads this to
-- show a warning banner instead of immediately cutting off access.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ;

COMMENT ON COLUMN workspaces.grace_period_ends_at IS
  'Set when subscription is canceled. Premium features remain accessible
   until this timestamp to give users time to update payment.';

-- ─── Absolute seat count setter ───────────────────────────────
-- increment_usage() adds a delta. This RPC sets an exact seat count after
-- member add/remove instead of trying to derive it from increments.

CREATE OR REPLACE FUNCTION set_seat_count(
  p_workspace_id UUID,
  p_count        INTEGER
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_period_start TIMESTAMPTZ := DATE_TRUNC('month', NOW());
  v_period_end   TIMESTAMPTZ := DATE_TRUNC('month', NOW()) + INTERVAL '1 month';
BEGIN
  -- Ensure a usage_records row exists for the current period
  INSERT INTO usage_records (workspace_id, period_start, period_end, active_seats)
  VALUES (p_workspace_id, v_period_start, v_period_end, p_count)
  ON CONFLICT (workspace_id, period_start)
    DO UPDATE SET active_seats = p_count, updated_at = NOW();
END;
$$;

-- ─── Fast idempotency lookup ──────────────────────────────────
-- billing_events already has stripe_event_id TEXT UNIQUE. Add a partial
-- index over non-null values so the idempotency check in handleStripeWebhook
-- stays sub-millisecond even at high event volume.

CREATE INDEX IF NOT EXISTS billing_events_stripe_event_id_idx
  ON billing_events (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

-- ─── Usage reset trigger ──────────────────────────────────────
-- Ensures each workspace always has a usage_records row for the current
-- billing period. Called via increment_usage() already — this just
-- documents the guarantee.

-- (No additional DDL needed — increment_usage already uses INSERT ... ON CONFLICT)
