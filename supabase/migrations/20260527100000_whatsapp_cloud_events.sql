-- Migration: 20260527100000_whatsapp_cloud_events.sql
-- Risk: LOW — nueva tabla, no modifica existentes
-- Purpose: idempotency table for WhatsApp Cloud API inbound events
-- Rollback: DROP TABLE IF EXISTS whatsapp_cloud_events;

BEGIN;

CREATE TABLE IF NOT EXISTS whatsapp_cloud_events (
  wamid        text        NOT NULL,
  account_id   uuid        NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (wamid, account_id)
);

-- Auto-purge events older than 7 days (prevents unbounded growth)
-- Run manually or via pg_cron if available:
-- DELETE FROM whatsapp_cloud_events WHERE received_at < now() - interval '7 days';

COMMENT ON TABLE whatsapp_cloud_events IS
  'Idempotency store for WhatsApp Cloud API inbound wamids. '
  'Prevents duplicate processing on Evolution/Meta webhook retries.';

-- RLS: service_role only (worker always uses admin client)
ALTER TABLE whatsapp_cloud_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON whatsapp_cloud_events TO service_role;

COMMIT;
