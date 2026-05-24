-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: complete WhatsApp schema
--
--   1. Extend whatsapp_instances  — phone_number, display_name, avatar, active flag
--   2. whatsapp_contacts          — WhatsApp-native contact data per instance
--   3. whatsapp_chats             — chat threads (1-to-1 and groups)
--   4. whatsapp_messages          — full message store with media + reply metadata
--   5. automation_logs            — immutable audit log of automation executions
--
-- All tables follow the same conventions as the rest of the schema:
--   • user_id  references auth.users(id) ON DELETE CASCADE
--   • RLS enabled, one policy per operation (select / insert / update / delete)
--   • set_updated_at() trigger on every mutable table
--   • REPLICA IDENTITY FULL + supabase_realtime publication on hot tables
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Extend whatsapp_instances ─────────────────────────────────────────────
-- The core table was created in migration 20260521100000.
-- Add profile fields so the UI can display connected account details.

alter table public.whatsapp_instances
  add column if not exists phone_number  text,
  add column if not exists display_name  text,
  add column if not exists avatar_url    text,
  add column if not exists is_active     boolean not null default true;

-- ── 2. whatsapp_contacts ─────────────────────────────────────────────────────
-- One row per WhatsApp contact per instance.  Separate from public.contacts so
-- WhatsApp-specific metadata (JIDs, business flags, WA avatars) doesn't pollute
-- the CRM contact record.  The optional contact_id column links a WhatsApp
-- contact back to its CRM counterpart once the user merges them.

create table if not exists public.whatsapp_contacts (
  id               uuid        primary key default gen_random_uuid(),

  user_id          uuid        not null
                               references auth.users(id)
                               on delete cascade,

  instance_id      uuid        not null
                               references public.whatsapp_instances(id)
                               on delete cascade,

  -- Optional link to the CRM contact (set when the agent links/creates a contact)
  contact_id       uuid
                               references public.contacts(id)
                               on delete set null,

  -- WhatsApp identity
  whatsapp_id      text        not null,   -- full JID: "5511999@s.whatsapp.net"
  phone            text,                   -- digits only: "5511999"
  push_name        text,                   -- display name reported by WhatsApp
  business_name    text,                   -- set when is_business = true
  about            text,                   -- WhatsApp "about" status text
  avatar_url       text,                   -- profile picture URL

  -- Contact flags
  is_business      boolean     not null default false,
  is_blocked       boolean     not null default false,
  is_my_contact    boolean     not null default false, -- in device's address book
  last_seen_at     timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- One WhatsApp ID is unique per instance (a JID cannot appear twice)
  unique (instance_id, whatsapp_id)
);

drop trigger if exists set_whatsapp_contacts_updated_at on public.whatsapp_contacts;
create trigger set_whatsapp_contacts_updated_at
  before update on public.whatsapp_contacts
  for each row execute procedure public.set_updated_at();

create index if not exists whatsapp_contacts_user_id_idx
  on public.whatsapp_contacts (user_id);

create index if not exists whatsapp_contacts_instance_id_idx
  on public.whatsapp_contacts (instance_id);

create index if not exists whatsapp_contacts_phone_idx
  on public.whatsapp_contacts (user_id, phone);

create index if not exists whatsapp_contacts_contact_id_idx
  on public.whatsapp_contacts (contact_id)
  where contact_id is not null;

alter table public.whatsapp_contacts enable row level security;

drop policy if exists "wc_select_own" on public.whatsapp_contacts;
drop policy if exists "wc_insert_own" on public.whatsapp_contacts;
drop policy if exists "wc_update_own" on public.whatsapp_contacts;
drop policy if exists "wc_delete_own" on public.whatsapp_contacts;

create policy "wc_select_own" on public.whatsapp_contacts
  for select using (auth.uid() = user_id);
create policy "wc_insert_own" on public.whatsapp_contacts
  for insert with check (auth.uid() = user_id);
create policy "wc_update_own" on public.whatsapp_contacts
  for update using (auth.uid() = user_id);
create policy "wc_delete_own" on public.whatsapp_contacts
  for delete using (auth.uid() = user_id);

-- ── 3. whatsapp_chats ────────────────────────────────────────────────────────
-- One row per WhatsApp chat thread.  For 1-to-1 chats the remote_jid is the
-- contact's JID; for groups it is the group JID (ending in @g.us).
--
-- Denormalized last_message_* columns avoid a join on every list render.
-- conversation_id optionally links this chat to the CRM conversation thread.

create table if not exists public.whatsapp_chats (
  id                    uuid        primary key default gen_random_uuid(),

  user_id               uuid        not null
                                    references auth.users(id)
                                    on delete cascade,

  instance_id           uuid        not null
                                    references public.whatsapp_instances(id)
                                    on delete cascade,

  whatsapp_contact_id   uuid
                                    references public.whatsapp_contacts(id)
                                    on delete set null,

  -- Optional bridge to the CRM conversation
  conversation_id       uuid
                                    references public.conversations(id)
                                    on delete set null,

  remote_jid            text        not null,    -- full JID of the chat
  name                  text,                    -- display name (contact or group name)
  is_group              boolean     not null default false,
  group_description     text,                    -- populated for group chats

  -- Inbox state
  unread_count          integer     not null default 0,
  pinned                boolean     not null default false,
  archived              boolean     not null default false,
  muted_until           timestamptz,             -- null = not muted

  -- Denormalized for fast list rendering
  last_message_at       timestamptz,
  last_message_preview  text,
  last_message_sender   text
                        check (last_message_sender in ('me', 'them')),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- One chat JID is unique per instance
  unique (instance_id, remote_jid)
);

drop trigger if exists set_whatsapp_chats_updated_at on public.whatsapp_chats;
create trigger set_whatsapp_chats_updated_at
  before update on public.whatsapp_chats
  for each row execute procedure public.set_updated_at();

create index if not exists whatsapp_chats_user_id_idx
  on public.whatsapp_chats (user_id);

create index if not exists whatsapp_chats_instance_id_idx
  on public.whatsapp_chats (instance_id);

create index if not exists whatsapp_chats_contact_id_idx
  on public.whatsapp_chats (whatsapp_contact_id)
  where whatsapp_contact_id is not null;

create index if not exists whatsapp_chats_last_message_at_idx
  on public.whatsapp_chats (user_id, last_message_at desc);

create index if not exists whatsapp_chats_archived_idx
  on public.whatsapp_chats (user_id, archived, last_message_at desc);

alter table public.whatsapp_chats enable row level security;

drop policy if exists "wch_select_own" on public.whatsapp_chats;
drop policy if exists "wch_insert_own" on public.whatsapp_chats;
drop policy if exists "wch_update_own" on public.whatsapp_chats;
drop policy if exists "wch_delete_own" on public.whatsapp_chats;

create policy "wch_select_own" on public.whatsapp_chats
  for select using (auth.uid() = user_id);
create policy "wch_insert_own" on public.whatsapp_chats
  for insert with check (auth.uid() = user_id);
create policy "wch_update_own" on public.whatsapp_chats
  for update using (auth.uid() = user_id);
create policy "wch_delete_own" on public.whatsapp_chats
  for delete using (auth.uid() = user_id);

-- ── 4. whatsapp_messages ─────────────────────────────────────────────────────
-- Complete message store.  Every message received or sent through Evolution API
-- is stored here with its full metadata.
--
-- external_id is the WhatsApp message ID (Evolution key.id) — the canonical
-- key for correlating delivery receipts (messages.update events) back to rows.
--
-- raw_content stores the full Evolution API message object as JSONB so we can
-- reprocess any message type in the future without data loss.
--
-- Message lifecycle:
--   incoming  → inserted with status "received", from_me = false
--   outbound  → inserted with status "pending", from_me = true
--               updated to "sent" → "delivered" → "read" / "played" via receipts

create table if not exists public.whatsapp_messages (
  id                  uuid        primary key default gen_random_uuid(),

  user_id             uuid        not null
                                  references auth.users(id)
                                  on delete cascade,

  instance_id         uuid        not null
                                  references public.whatsapp_instances(id)
                                  on delete cascade,

  chat_id             uuid        not null
                                  references public.whatsapp_chats(id)
                                  on delete cascade,

  -- Self-referential: message this one is replying to
  quoted_message_id   uuid
                                  references public.whatsapp_messages(id)
                                  on delete set null,

  -- WhatsApp identity
  external_id         text        not null unique, -- Evolution key.id
  remote_jid          text        not null,        -- sender JID
  push_name           text,                        -- sender's display name
  from_me             boolean     not null,        -- true = we sent it

  -- Content
  type                text        not null default 'text'
                      check (type in (
                        'text', 'image', 'video', 'audio', 'document',
                        'sticker', 'location', 'contact', 'reaction',
                        'poll', 'template', 'ptv', 'unknown'
                      )),

  content             text        not null default '', -- plain-text representation
  caption             text,                            -- media caption
  raw_content         jsonb,                           -- full Evolution message object

  -- Media metadata (populated for image/video/audio/document/sticker)
  media_url           text,
  media_mime_type     text,
  media_size          bigint,
  media_sha256        text,     -- for deduplication and verification
  media_duration_sec  integer,  -- for audio / video

  -- Message state
  status              text        not null default 'received'
                      check (status in (
                        'pending', 'sent', 'delivered', 'read', 'played',
                        'received', 'failed'
                      )),

  is_forwarded        boolean     not null default false,
  is_starred          boolean     not null default false,
  is_ephemeral        boolean     not null default false, -- view-once

  -- Lifecycle timestamps
  timestamp           timestamptz not null,  -- original WhatsApp message timestamp
  edited_at           timestamptz,           -- set when the message is edited
  deleted_at          timestamptz,           -- soft-delete (WhatsApp retract)

  created_at          timestamptz not null default now()
  -- No updated_at: use edited_at / deleted_at for mutation tracking
);

create index if not exists whatsapp_messages_chat_id_idx
  on public.whatsapp_messages (chat_id, timestamp asc);

create index if not exists whatsapp_messages_user_id_idx
  on public.whatsapp_messages (user_id);

create index if not exists whatsapp_messages_instance_id_idx
  on public.whatsapp_messages (instance_id);

-- Fast lookup when updating status from delivery receipts
create index if not exists whatsapp_messages_status_idx
  on public.whatsapp_messages (external_id, status)
  where from_me = true;

-- Fast lookup of unread messages per chat
create index if not exists whatsapp_messages_unread_idx
  on public.whatsapp_messages (chat_id, from_me, status)
  where from_me = false and deleted_at is null;

create index if not exists whatsapp_messages_quoted_idx
  on public.whatsapp_messages (quoted_message_id)
  where quoted_message_id is not null;

alter table public.whatsapp_messages enable row level security;

drop policy if exists "wm_select_own" on public.whatsapp_messages;
drop policy if exists "wm_insert_own" on public.whatsapp_messages;
drop policy if exists "wm_update_own" on public.whatsapp_messages;
drop policy if exists "wm_delete_own" on public.whatsapp_messages;

create policy "wm_select_own" on public.whatsapp_messages
  for select using (auth.uid() = user_id);
create policy "wm_insert_own" on public.whatsapp_messages
  for insert with check (auth.uid() = user_id);
create policy "wm_update_own" on public.whatsapp_messages
  for update using (auth.uid() = user_id);
create policy "wm_delete_own" on public.whatsapp_messages
  for delete using (auth.uid() = user_id);

-- ── 5. automation_logs ───────────────────────────────────────────────────────
-- Immutable audit log — one row per automation execution.  Written only by the
-- webhook (admin client, bypasses RLS).  The UI reads these to show the agent
-- what actions were taken automatically and why.
--
-- actions_executed is a JSONB array of individual action results, e.g.:
--   [
--     { "type": "send_message", "status": "ok",     "duration_ms": 312 },
--     { "type": "ai_reply",     "status": "ok",     "duration_ms": 1840,
--       "reply_preview": "Olá! Como posso ajudar?" },
--     { "type": "add_tag",      "status": "failed", "error": "contact not found" }
--   ]

create table if not exists public.automation_logs (
  id                  uuid        primary key default gen_random_uuid(),

  user_id             uuid        not null
                                  references auth.users(id)
                                  on delete cascade,

  -- Context of what triggered this execution
  automation_id       uuid
                                  references public.webhook_automations(id)
                                  on delete set null,

  instance_id         uuid
                                  references public.whatsapp_instances(id)
                                  on delete set null,

  chat_id             uuid
                                  references public.whatsapp_chats(id)
                                  on delete set null,

  -- What happened
  trigger_event       text        not null,           -- "new_message" etc.
  trigger_payload     jsonb       not null default '{}', -- the raw incoming event

  status              text        not null default 'completed'
                      check (status in ('completed', 'failed', 'skipped')),

  actions_executed    jsonb       not null default '[]',
  error_message       text,
  duration_ms         integer,    -- wall-clock time for the full automation run

  created_at          timestamptz not null default now()
  -- No updated_at — logs are written once and never changed
);

create index if not exists automation_logs_user_id_idx
  on public.automation_logs (user_id, created_at desc);

create index if not exists automation_logs_automation_id_idx
  on public.automation_logs (automation_id)
  where automation_id is not null;

create index if not exists automation_logs_status_idx
  on public.automation_logs (user_id, status, created_at desc);

create index if not exists automation_logs_chat_id_idx
  on public.automation_logs (chat_id)
  where chat_id is not null;

alter table public.automation_logs enable row level security;

drop policy if exists "al_select_own" on public.automation_logs;

-- Read-only for the user — the webhook (admin client) handles inserts
create policy "al_select_own" on public.automation_logs
  for select using (auth.uid() = user_id);

-- ── 6. Realtime ──────────────────────────────────────────────────────────────
-- Enable full-row payloads on the two tables that drive the live chat UI.
-- whatsapp_contacts and automation_logs do not need real-time updates.

alter table public.whatsapp_chats   replica identity full;
alter table public.whatsapp_messages replica identity full;

alter publication supabase_realtime add table public.whatsapp_chats;
alter publication supabase_realtime add table public.whatsapp_messages;
