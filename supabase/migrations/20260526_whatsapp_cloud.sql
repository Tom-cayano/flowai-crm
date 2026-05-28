-- ─── WhatsApp Cloud API direct integration ────────────────────────────────────
-- Separate from Evolution API (whatsapp_instances).
-- One row per phone number connected to the Cloud API WABA.
--
-- Token storage format: <iv_hex>:<authTag_hex>:<ciphertext_hex> (AES-256-GCM)
-- Reuses INSTAGRAM_TOKEN_ENCRYPTION_KEY (same algorithm, same helper).

CREATE TABLE IF NOT EXISTS whatsapp_cloud_accounts (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID         NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id              UUID         NOT NULL REFERENCES auth.users(id),
  -- WhatsApp Business Account ID (WABA)
  waba_id              TEXT         NOT NULL,
  -- Phone Number ID assigned by Meta (used as API endpoint segment)
  phone_number_id      TEXT         NOT NULL,
  -- Human-readable number shown in Meta dashboard (+15559876543)
  display_phone_number TEXT,
  -- Business verified name shown to recipients
  verified_name        TEXT,
  -- System user access token, encrypted with AES-256-GCM
  -- Generate a system user token in Meta Business Suite → System Users
  access_token_enc     TEXT         NOT NULL,
  token_expires_at     TIMESTAMPTZ,
  -- Random token used for Meta webhook verification handshake
  webhook_verify_token TEXT         NOT NULL DEFAULT (gen_random_uuid()::text),
  connection_state     TEXT         NOT NULL DEFAULT 'connected'
    CHECK (connection_state IN ('connected', 'disconnected', 'token_expired', 'error')),
  last_error           TEXT,
  last_synced_at       TIMESTAMPTZ,
  is_active            BOOLEAN      NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, phone_number_id)
);

-- ─── Webhook idempotency log ──────────────────────────────────────────────────
-- Deduplicates incoming Cloud API webhook events by wamid.

CREATE TABLE IF NOT EXISTS whatsapp_cloud_events (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     TEXT         NOT NULL UNIQUE,   -- wamid (message ID from Meta)
  event_type   TEXT         NOT NULL,          -- 'message' | 'status' | 'reaction'
  account_id   UUID         REFERENCES whatsapp_cloud_accounts(id) ON DELETE SET NULL,
  raw_payload  JSONB        NOT NULL DEFAULT '{}',
  processed_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS wac_accounts_workspace_idx  ON whatsapp_cloud_accounts (workspace_id);
CREATE INDEX IF NOT EXISTS wac_accounts_user_idx       ON whatsapp_cloud_accounts (user_id);
CREATE INDEX IF NOT EXISTS wac_accounts_phone_num_idx  ON whatsapp_cloud_accounts (phone_number_id);
CREATE INDEX IF NOT EXISTS wac_accounts_waba_idx       ON whatsapp_cloud_accounts (waba_id);
CREATE INDEX IF NOT EXISTS wac_events_type_idx         ON whatsapp_cloud_events (event_type);
CREATE INDEX IF NOT EXISTS wac_events_account_idx      ON whatsapp_cloud_events (account_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE whatsapp_cloud_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_cloud_events   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wac_accounts_own" ON whatsapp_cloud_accounts
  FOR ALL USING (auth.uid() = user_id);

-- Webhook events written by service role only; deny direct select
CREATE POLICY "wac_events_deny_select" ON whatsapp_cloud_events
  FOR SELECT USING (false);

-- ─── updated_at trigger ───────────────────────────────────────────────────────

CREATE TRIGGER whatsapp_cloud_accounts_updated_at
  BEFORE UPDATE ON whatsapp_cloud_accounts
  FOR EACH ROW EXECUTE FUNCTION set_instagram_updated_at();
  -- Reuses the trigger function defined in 20260522_instagram.sql
