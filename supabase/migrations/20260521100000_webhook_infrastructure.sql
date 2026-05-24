-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: webhook infrastructure
--   1. whatsapp_instances — maps Evolution API instances to CRM users
--   2. user_ai_settings   — per-user OpenAI configuration
--   3. webhook_automations — automation rules triggered by webhook events
--   4. messages.external_id — WhatsApp message ID for status tracking
--   5. increment_unread()  — atomic unread counter function
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. whatsapp_instances ────────────────────────────────────────────────────
-- Each row links one Evolution API instance (a connected WhatsApp number)
-- to one CRM user. The server_url and api_key are used by the webhook to
-- send outbound messages (AI replies, automation messages) back through the
-- same instance.

create table if not exists public.whatsapp_instances (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users(id) on delete cascade,
  instance_name    text        not null unique,
  server_url       text        not null,
  api_key          text        not null,
  connection_state text        not null default 'close'
                               check (connection_state in ('open', 'close', 'connecting')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists set_whatsapp_instances_updated_at on public.whatsapp_instances;
create trigger set_whatsapp_instances_updated_at
  before update on public.whatsapp_instances
  for each row execute procedure public.set_updated_at();

create index if not exists whatsapp_instances_user_id_idx
  on public.whatsapp_instances (user_id);

alter table public.whatsapp_instances enable row level security;

drop policy if exists "instances_select_own" on public.whatsapp_instances;
drop policy if exists "instances_insert_own" on public.whatsapp_instances;
drop policy if exists "instances_update_own" on public.whatsapp_instances;
drop policy if exists "instances_delete_own" on public.whatsapp_instances;

create policy "instances_select_own" on public.whatsapp_instances
  for select using (auth.uid() = user_id);
create policy "instances_insert_own" on public.whatsapp_instances
  for insert with check (auth.uid() = user_id);
create policy "instances_update_own" on public.whatsapp_instances
  for update using (auth.uid() = user_id);
create policy "instances_delete_own" on public.whatsapp_instances
  for delete using (auth.uid() = user_id);

-- ── 2. user_ai_settings ──────────────────────────────────────────────────────
-- One row per user. Controls whether AI auto-replies are active and which
-- OpenAI model/parameters to use. The system_prompt defines the AI persona.

create table if not exists public.user_ai_settings (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null unique references auth.users(id) on delete cascade,
  enabled       boolean     not null default false,
  model         text        not null default 'gpt-4o-mini',
  system_prompt text,
  max_tokens    integer     not null default 500,
  temperature   numeric     not null default 0.7,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists set_user_ai_settings_updated_at on public.user_ai_settings;
create trigger set_user_ai_settings_updated_at
  before update on public.user_ai_settings
  for each row execute procedure public.set_updated_at();

alter table public.user_ai_settings enable row level security;

drop policy if exists "ai_settings_select_own" on public.user_ai_settings;
drop policy if exists "ai_settings_insert_own" on public.user_ai_settings;
drop policy if exists "ai_settings_update_own" on public.user_ai_settings;

create policy "ai_settings_select_own" on public.user_ai_settings
  for select using (auth.uid() = user_id);
create policy "ai_settings_insert_own" on public.user_ai_settings
  for insert with check (auth.uid() = user_id);
create policy "ai_settings_update_own" on public.user_ai_settings
  for update using (auth.uid() = user_id);

-- ── 3. webhook_automations ───────────────────────────────────────────────────
-- Flexible rule engine. Each row is one rule: when trigger_event fires and
-- conditions match, execute the actions array in order.
--
-- Example conditions (jsonb):
--   { "keyword": "preço", "keyword_match": "contains" }
--   { "is_first_message": true }
--   {}  ← matches every message
--
-- Example actions (jsonb array):
--   [
--     { "type": "send_message", "content": "Olá! Um momento..." },
--     { "type": "add_tag",      "tag": "lead-quente" },
--     { "type": "ai_reply" }
--   ]
--
-- Supported action types:
--   send_message   — send a WhatsApp text via Evolution API
--   add_tag        — add a tag to the contact
--   change_status  — update conversation status
--   assign_agent   — set assigned_to on conversation
--   ai_reply       — trigger OpenAI auto-reply

create table if not exists public.webhook_automations (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  name          text        not null,
  enabled       boolean     not null default true,
  trigger_event text        not null default 'new_message',
  conditions    jsonb       not null default '{}',
  actions       jsonb       not null default '[]',
  priority      integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists set_webhook_automations_updated_at on public.webhook_automations;
create trigger set_webhook_automations_updated_at
  before update on public.webhook_automations
  for each row execute procedure public.set_updated_at();

create index if not exists webhook_automations_user_id_idx
  on public.webhook_automations (user_id, enabled, trigger_event);

alter table public.webhook_automations enable row level security;

drop policy if exists "automations_select_own" on public.webhook_automations;
drop policy if exists "automations_insert_own" on public.webhook_automations;
drop policy if exists "automations_update_own" on public.webhook_automations;
drop policy if exists "automations_delete_own" on public.webhook_automations;

create policy "automations_select_own" on public.webhook_automations
  for select using (auth.uid() = user_id);
create policy "automations_insert_own" on public.webhook_automations
  for insert with check (auth.uid() = user_id);
create policy "automations_update_own" on public.webhook_automations
  for update using (auth.uid() = user_id);
create policy "automations_delete_own" on public.webhook_automations
  for delete using (auth.uid() = user_id);

-- ── 4. messages.external_id ──────────────────────────────────────────────────
-- Stores the WhatsApp message ID (Evolution API key.id) on outbound messages
-- so we can match messages.update status events back to CRM rows.

alter table public.messages
  add column if not exists external_id text;

create index if not exists messages_external_id_idx
  on public.messages (external_id)
  where external_id is not null;

-- ── 5. increment_unread() ─────────────────────────────────────────────────────
-- Atomically bumps the unread counter on a conversation without a read-modify-
-- write race condition. Called from the webhook after each inbound message.

create or replace function public.increment_unread(p_id uuid)
returns void
language sql
as $$
  update public.conversations
  set unread_count = unread_count + 1
  where id = p_id;
$$;
