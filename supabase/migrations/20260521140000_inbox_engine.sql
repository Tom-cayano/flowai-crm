-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Realtime inbox engine
--
--   1. conversations    — add instance_id + full-text search vector
--   2. messages         — add media fields + retry support
--   3. ai_context       — per-conversation AI memory
--   4. Indexes          — FTS, assignment, instance lookups
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. conversations — instance link ────────────────────────────────────────
alter table public.conversations
  add column if not exists instance_id uuid
    references public.whatsapp_instances(id) on delete set null,
  add column if not exists fts tsvector
    generated always as (
      to_tsvector('simple',
        coalesce(contact_name, '') || ' ' ||
        coalesce(contact_phone, '') || ' ' ||
        coalesce(last_message_preview, '')
      )
    ) stored;

create index if not exists idx_conversations_fts
  on public.conversations using gin(fts);

create index if not exists idx_conversations_instance
  on public.conversations (instance_id)
  where instance_id is not null;

create index if not exists idx_conversations_assigned
  on public.conversations (user_id, assigned_to)
  where assigned_to is not null;

-- ── 2. messages — media + retry fields ──────────────────────────────────────
alter table public.messages
  add column if not exists media_url       text,
  add column if not exists media_mime_type text,
  add column if not exists thumbnail_url   text,
  add column if not exists quoted_message_id uuid
    references public.messages(id) on delete set null,
  add column if not exists retry_count     smallint not null default 0,
  add column if not exists failed_reason   text;

create index if not exists idx_messages_failed
  on public.messages (conversation_id, status)
  where status = 'failed';

create index if not exists idx_messages_external_id
  on public.messages (external_id)
  where external_id is not null;

-- ── 3. ai_context — per-conversation AI memory ──────────────────────────────
create table if not exists public.ai_context (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users(id) on delete cascade,
  conversation_id  uuid        not null references public.conversations(id) on delete cascade,
  -- Rolling summary written by the AI after each turn
  summary          text,
  -- Key-value facts the AI has learned about this contact
  facts            jsonb       not null default '{}',
  -- Last N messages included in the next prompt context window
  message_window   integer     not null default 20,
  -- Total tokens consumed across all AI calls for this conversation
  tokens_used      integer     not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (conversation_id)
);

drop trigger if exists set_ai_context_updated_at on public.ai_context;
create trigger set_ai_context_updated_at
  before update on public.ai_context
  for each row execute procedure public.set_updated_at();

create index if not exists idx_ai_context_conv
  on public.ai_context (conversation_id);

alter table public.ai_context enable row level security;
create policy "ai_ctx_select_own" on public.ai_context
  for select using (auth.uid() = user_id);
create policy "ai_ctx_insert_own" on public.ai_context
  for insert with check (auth.uid() = user_id);
create policy "ai_ctx_update_own" on public.ai_context
  for update using (auth.uid() = user_id);

-- ── 4. Realtime — enable for messages (already on conversations) ─────────────
alter table public.messages replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
