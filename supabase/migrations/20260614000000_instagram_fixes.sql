-- ─── Migration: Instagram Integration Fixes ──────────────────────────────────
-- Date: 2026-06-14
-- Author: FlowAI CRM
--
-- Fixes applied:
--   1. Add index on instagram_contacts.contact_id for faster contact linking
--   2. Add index on instagram_contacts.ig_user_id for faster lookups
--   3. Backfill contact_id in instagram_contacts from existing contacts.phone matches
--   4. Backfill display_name from ig_username where display_name is NULL
--   5. Upgrade conversations.contact_name from "ig:XXXXX" to "@username"
--      where the username is now known (joined via instagram_contacts)
--   6. Upgrade contacts.name from "ig:XXXXX" to "@username"
--      where the username is now known (joined via instagram_contacts)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS instagram_contacts_contact_id_idx
  ON instagram_contacts (contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS instagram_contacts_ig_user_id_idx
  ON instagram_contacts (ig_user_id);

CREATE INDEX IF NOT EXISTS instagram_contacts_username_idx
  ON instagram_contacts (ig_username)
  WHERE ig_username IS NOT NULL;

-- ── 2. Backfill display_name from ig_username ────────────────────────────────
-- Any row that has ig_username but no display_name should get display_name filled in.

UPDATE instagram_contacts
SET display_name = ig_username
WHERE ig_username IS NOT NULL
  AND display_name IS NULL;

-- ── 3. Backfill contact_id in instagram_contacts ─────────────────────────────
-- Link instagram_contacts to existing contacts rows by matching user_id + phone.
-- This repairs the permanent NULL contact_id bug.

UPDATE instagram_contacts ic
SET contact_id = c.id
FROM contacts c
WHERE ic.contact_id IS NULL
  AND ic.user_id = c.user_id
  AND c.phone = ic.ig_user_id;

-- ── 4. Upgrade contacts.name from "ig:XXXXX" to "@username" ─────────────────
-- Where instagram_contacts has a known username for the same ig_user_id.

UPDATE contacts c
SET name = '@' || ic.ig_username
FROM instagram_contacts ic
WHERE c.phone = ic.ig_user_id
  AND c.user_id = ic.user_id
  AND ic.ig_username IS NOT NULL
  AND c.name LIKE 'ig:%';

-- ── 5. Upgrade conversations.contact_name from "ig:XXXXX" to "@username" ────
-- Where instagram_contacts has a known username for the same contact_phone.

UPDATE conversations conv
SET
  contact_name = '@' || ic.ig_username,
  contact_id   = COALESCE(conv.contact_id, ic.contact_id)
FROM instagram_contacts ic
WHERE conv.contact_phone = ic.ig_user_id
  AND conv.user_id = ic.user_id
  AND conv.channel = 'instagram'
  AND ic.ig_username IS NOT NULL
  AND conv.contact_name LIKE 'ig:%';

-- ── 6. Summary view: contacts still missing username ────────────────────────
-- (Run this manually to see what still needs App Review resolution)
--
-- SELECT
--   ic.id,
--   ic.ig_user_id,
--   ic.ig_username,
--   ic.display_name,
--   ic.contact_id,
--   ia.ig_username AS account_username,
--   ia.connection_state
-- FROM instagram_contacts ic
-- JOIN instagram_accounts ia ON ia.id = ic.account_id
-- WHERE ic.ig_username IS NULL
-- ORDER BY ic.created_at DESC
-- LIMIT 50;
