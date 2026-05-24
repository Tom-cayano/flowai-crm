-- ─── Phase 5: Facebook Messenger Infrastructure ──────────────────────────────
-- Minimal schema for Messenger integration:
--   facebook_pages           — Facebook Page connections (page access tokens)
--   messenger_webhook_events — idempotency log for Messenger MIDs
--
-- Contacts, conversations, and messages are stored in the shared CRM layer
-- with channel = 'messenger'. No separate messenger_* tables needed beyond
-- idempotency and account resolution.

-- ─── Facebook Pages ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS facebook_pages (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID         NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id               UUID         NOT NULL REFERENCES auth.users(id),
  page_id               TEXT         NOT NULL,
  page_name             TEXT,
  -- Page access token encrypted with AES-256-GCM using INSTAGRAM_TOKEN_ENCRYPTION_KEY
  -- Format: <iv_hex>:<authTag_hex>:<ciphertext_hex>  (same as instagram_accounts)
  page_access_token_enc TEXT         NOT NULL,
  is_active             BOOLEAN      NOT NULL DEFAULT true,
  connected_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, page_id)
);

-- ─── Messenger webhook idempotency log ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS messenger_webhook_events (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      TEXT         NOT NULL UNIQUE,  -- MID (dedup key — same as instagram_webhook_events)
  event_type    TEXT         NOT NULL,
  page_id       TEXT,
  raw_payload   JSONB        NOT NULL DEFAULT '{}',
  processed_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS facebook_pages_user_idx       ON facebook_pages (user_id);
CREATE INDEX IF NOT EXISTS facebook_pages_page_id_idx    ON facebook_pages (page_id);
CREATE INDEX IF NOT EXISTS facebook_pages_workspace_idx  ON facebook_pages (workspace_id);
CREATE INDEX IF NOT EXISTS messenger_events_type_idx     ON messenger_webhook_events (event_type);
CREATE INDEX IF NOT EXISTS messenger_events_page_idx     ON messenger_webhook_events (page_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE facebook_pages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE messenger_webhook_events ENABLE ROW LEVEL SECURITY;

-- Users see only their own page connections
CREATE POLICY "facebook_pages_own" ON facebook_pages
  FOR ALL USING (auth.uid() = user_id);

-- Webhook events are write-only from service role (same pattern as instagram_webhook_events)
CREATE POLICY "messenger_webhook_events_deny_select" ON messenger_webhook_events
  FOR SELECT USING (false);

-- ─── updated_at trigger ───────────────────────────────────────────────────────

CREATE TRIGGER facebook_pages_updated_at
  BEFORE UPDATE ON facebook_pages
  FOR EACH ROW EXECUTE FUNCTION set_instagram_updated_at();
  -- Reuses the trigger function created in 20260522_instagram.sql
