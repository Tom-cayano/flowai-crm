-- ─── Phase 4: Instagram Automation Infrastructure ────────────────────────────
-- Three-tier schema mirroring the WhatsApp layer:
--   Tier 1: Instagram-native tables (accounts, contacts, threads, messages)
--   Tier 2: Bridges to CRM layer (conversations, messages)
--   Tier 3: Webhook idempotency + comment events

-- ─── Tier 1: Instagram native ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS instagram_accounts (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       UUID         NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id            UUID         NOT NULL REFERENCES auth.users(id),
  ig_user_id         TEXT         NOT NULL,
  ig_username        TEXT         NOT NULL,
  -- Encrypted with AES-256-GCM using INSTAGRAM_TOKEN_ENCRYPTION_KEY
  access_token_enc   TEXT         NOT NULL,
  token_expires_at   TIMESTAMPTZ,
  page_id            TEXT,
  page_name          TEXT,
  avatar_url         TEXT,
  followers_count    INTEGER      NOT NULL DEFAULT 0,
  connection_state   TEXT         NOT NULL DEFAULT 'connected',
    -- 'connected' | 'disconnected' | 'token_expired' | 'error'
  last_error         TEXT,
  last_synced_at     TIMESTAMPTZ,
  is_active          BOOLEAN      NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, ig_user_id)
);

CREATE TABLE IF NOT EXISTS instagram_contacts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID        NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES auth.users(id),
  ig_user_id       TEXT        NOT NULL,   -- the other person's Instagram scoped user ID
  ig_username      TEXT,
  display_name     TEXT,
  avatar_url       TEXT,
  contact_id       UUID        REFERENCES contacts(id) ON DELETE SET NULL,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, ig_user_id)
);

CREATE TABLE IF NOT EXISTS instagram_threads (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID        NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES auth.users(id),
  ig_thread_id     TEXT        NOT NULL,  -- Instagram conversation/thread ID (from Graph API)
  ig_contact_id    UUID        REFERENCES instagram_contacts(id),
  conversation_id  UUID        REFERENCES conversations(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, ig_thread_id)
);

CREATE TABLE IF NOT EXISTS instagram_messages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id        UUID        NOT NULL REFERENCES instagram_threads(id) ON DELETE CASCADE,
  account_id       UUID        NOT NULL REFERENCES instagram_accounts(id),
  user_id          UUID        NOT NULL REFERENCES auth.users(id),
  ig_message_id    TEXT        NOT NULL UNIQUE,  -- idempotency key (MID from Meta)
  from_ig_user_id  TEXT        NOT NULL,
  from_me          BOOLEAN     NOT NULL DEFAULT false,
  content          TEXT,
  message_type     TEXT        NOT NULL DEFAULT 'text',
    -- 'text' | 'image' | 'video' | 'audio' | 'share' | 'story_mention' | 'unsupported'
  media_url        TEXT,
  media_mime_type  TEXT,
  story_id         TEXT,
  referral_url     TEXT,
  is_deleted       BOOLEAN     NOT NULL DEFAULT false,
  status           TEXT        NOT NULL DEFAULT 'received',
    -- 'received' | 'sent' | 'delivered' | 'read' | 'failed'
  external_id      TEXT,       -- CRM messages.id link (set after CRM mirror write)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Webhook idempotency log ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS instagram_webhook_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      TEXT        NOT NULL UNIQUE,  -- MID or comment ID (dedup key)
  event_type    TEXT        NOT NULL,
  account_id    UUID        REFERENCES instagram_accounts(id) ON DELETE SET NULL,
  raw_payload   JSONB       NOT NULL DEFAULT '{}',
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Comment events (posts / reels / stories) ──────────────────────────────

CREATE TABLE IF NOT EXISTS instagram_comment_events (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID        NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  user_id             UUID        NOT NULL REFERENCES auth.users(id),
  ig_comment_id       TEXT        NOT NULL UNIQUE,
  ig_media_id         TEXT        NOT NULL,
  media_type          TEXT,       -- 'IMAGE' | 'VIDEO' | 'REEL' | 'CAROUSEL_ALBUM'
  from_ig_user_id     TEXT        NOT NULL,
  from_username       TEXT,
  content             TEXT,
  parent_comment_id   TEXT,       -- set if this is a reply to another comment
  reply_sent          BOOLEAN     NOT NULL DEFAULT false,
  reply_content       TEXT,
  replied_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS instagram_accounts_workspace_idx   ON instagram_accounts (workspace_id);
CREATE INDEX IF NOT EXISTS instagram_accounts_user_idx        ON instagram_accounts (user_id);
CREATE INDEX IF NOT EXISTS instagram_contacts_account_idx     ON instagram_contacts (account_id);
CREATE INDEX IF NOT EXISTS instagram_threads_account_idx      ON instagram_threads (account_id);
CREATE INDEX IF NOT EXISTS instagram_threads_conv_idx         ON instagram_threads (conversation_id);
CREATE INDEX IF NOT EXISTS instagram_messages_thread_idx      ON instagram_messages (thread_id);
CREATE INDEX IF NOT EXISTS instagram_messages_created_idx     ON instagram_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS instagram_webhook_events_type_idx  ON instagram_webhook_events (event_type);
CREATE INDEX IF NOT EXISTS instagram_comment_events_acct_idx  ON instagram_comment_events (account_id);
CREATE INDEX IF NOT EXISTS instagram_comment_events_media_idx ON instagram_comment_events (ig_media_id);

-- ─── Extend conversations channel enum (TEXT column — no ALTER TYPE needed) ──
-- The 'channel' column in conversations is TEXT, so inserting 'instagram' works.
-- We only update the TypeScript union; no SQL change required here.

-- ─── RLS policies ────────────────────────────────────────────────────────────

ALTER TABLE instagram_accounts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_contacts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_threads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_webhook_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_comment_events   ENABLE ROW LEVEL SECURITY;

-- Users may only see their own rows
CREATE POLICY "instagram_accounts_own" ON instagram_accounts
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "instagram_contacts_own" ON instagram_contacts
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "instagram_threads_own" ON instagram_threads
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "instagram_messages_own" ON instagram_messages
  FOR ALL USING (auth.uid() = user_id);

-- Webhook events and comment events are write-only from the service role
CREATE POLICY "instagram_webhook_events_deny_select" ON instagram_webhook_events
  FOR SELECT USING (false);

CREATE POLICY "instagram_comment_events_own" ON instagram_comment_events
  FOR ALL USING (auth.uid() = user_id);

-- ─── updated_at auto-trigger ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_instagram_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER instagram_accounts_updated_at
  BEFORE UPDATE ON instagram_accounts
  FOR EACH ROW EXECUTE FUNCTION set_instagram_updated_at();

CREATE TRIGGER instagram_threads_updated_at
  BEFORE UPDATE ON instagram_threads
  FOR EACH ROW EXECUTE FUNCTION set_instagram_updated_at();
