-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: WhatsApp module — performance & message queue
--   1. Performance indexes on hot query paths
--   2. message_queue — reliable outbound message delivery
--   3. whatsapp_instances — extra operational columns (safe IF NOT EXISTS)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Performance indexes ───────────────────────────────────────────────────
-- conversations: the two most common queries — list by user ordered by time,
-- and find open conversations by phone (used by webhook upsert).

create index if not exists idx_conversations_user_updated
  on public.conversations (user_id, updated_at desc);

create index if not exists idx_conversations_user_status
  on public.conversations (user_id, status);

create index if not exists idx_conversations_channel_phone
  on public.conversations (channel, contact_phone)
  where contact_phone is not null;

-- messages: load thread in order, and status-receipt lookups by external_id.
create index if not exists idx_messages_conv_created
  on public.messages (conversation_id, created_at asc);

-- contacts: webhook phone lookups (two separate columns).
create index if not exists idx_contacts_user_phone
  on public.contacts (user_id, phone)
  where phone is not null;

create index if not exists idx_contacts_user_whatsapp
  on public.contacts (user_id, whatsapp)
  where whatsapp is not null;

-- whatsapp_instances: webhook instance-name lookup (most frequent hot path).
create index if not exists idx_whatsapp_instances_name
  on public.whatsapp_instances (instance_name);

create index if not exists idx_whatsapp_instances_user
  on public.whatsapp_instances (user_id, is_active);

-- ── 2. whatsapp_instances — operational columns ──────────────────────────────
-- Added with IF NOT EXISTS so this migration is idempotent even if some columns
-- were created by an earlier migration.

alter table public.whatsapp_instances
  add column if not exists phone_number   text,
  add column if not exists display_name   text,
  add column if not exists avatar_url     text,
  add column if not exists is_active      boolean not null default true,
  -- Human-readable label set by the user in the UI
  add column if not exists label          text,
  -- Whether the CRM webhook has been registered on this instance
  add column if not exists webhook_set    boolean not null default false;

-- ── 3. message_queue ─────────────────────────────────────────────────────────
-- Reliable outbound message delivery. Messages are inserted as "pending" and
-- a worker (cron or background job) picks them up, calls Evolution API, and
-- marks them "sent" or "failed". Automatic retry up to max_attempts.
--
-- Why a queue?
--   • Webhook automation replies must survive Evolution API timeouts.
--   • Campaign blasts need rate-limiting (one at a time per instance).
--   • Retries happen without blocking the webhook response.

create table if not exists public.message_queue (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  instance_id     uuid        references public.whatsapp_instances(id) on delete set null,
  -- Nullable — set after the conversation is created (first message to new contact)
  conversation_id uuid        references public.conversations(id) on delete set null,
  phone           text        not null,
  content         text        not null,
  type            text        not null default 'text'
                              check (type in ('text', 'image', 'audio', 'document', 'template')),
  status          text        not null default 'pending'
                              check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts        smallint    not null default 0,
  max_attempts    smallint    not null default 3,
  -- Allows scheduling messages in the future (campaigns)
  scheduled_at    timestamptz not null default now(),
  sent_at         timestamptz,
  error_message   text,
  -- Source of the queued message, e.g. "automation", "campaign", "manual"
  origin          text        not null default 'manual',
  -- Automation or campaign ID that triggered this message (nullable)
  origin_id       uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Worker picks pending messages ordered by scheduled_at.
create index if not exists idx_message_queue_worker
  on public.message_queue (status, scheduled_at asc)
  where status in ('pending', 'processing');

create index if not exists idx_message_queue_instance
  on public.message_queue (instance_id, status)
  where instance_id is not null;

create index if not exists idx_message_queue_user
  on public.message_queue (user_id, created_at desc);

alter table public.message_queue enable row level security;

create policy "queue_select_own" on public.message_queue
  for select using (auth.uid() = user_id);

create policy "queue_insert_own" on public.message_queue
  for insert with check (auth.uid() = user_id);

create policy "queue_update_own" on public.message_queue
  for update using (auth.uid() = user_id);

create policy "queue_delete_own" on public.message_queue
  for delete using (auth.uid() = user_id);

-- ── 4. Helper functions ───────────────────────────────────────────────────────

-- enqueue_message: insert a message into the queue from a server action or
-- automation. Returns the queue entry id.
create or replace function public.enqueue_message(
  p_user_id       uuid,
  p_instance_id   uuid,
  p_phone         text,
  p_content       text,
  p_origin        text    default 'manual',
  p_origin_id     uuid    default null,
  p_scheduled_at  timestamptz default now()
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into public.message_queue
    (user_id, instance_id, phone, content, origin, origin_id, scheduled_at)
  values
    (p_user_id, p_instance_id, p_phone, p_content, p_origin, p_origin_id, p_scheduled_at)
  returning id into v_id;

  return v_id;
end;
$$;
