-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: conversations + messages tables
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- ── 1. Conversations ────────────────────────────────────────────────────────

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  contact_id uuid
    references public.contacts(id)
    on delete set null,

  contact_name text not null,
  contact_phone text,

  status text not null default 'open'
    check (status in ('open', 'pending', 'resolved', 'spam')),

  channel text not null default 'whatsapp'
    check (channel in ('whatsapp', 'email', 'sms')),

  assigned_to text,

  tags text[] not null default '{}',

  unread_count integer not null default 0,

  last_message_at timestamptz,
  last_message_preview text,

  last_message_sender text
    check (last_message_sender in ('agent', 'contact')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 2. Messages ─────────────────────────────────────────────────────────────

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),

  conversation_id uuid not null
    references public.conversations(id)
    on delete cascade,

  content text not null,

  type text not null default 'text'
    check (type in ('text', 'image', 'audio', 'document', 'template')),

  sender text not null
    check (sender in ('agent', 'contact')),

  status text not null default 'sent'
    check (status in ('sent', 'delivered', 'read', 'failed')),

  agent_name text,

  created_at timestamptz not null default now()
);

-- ── 3. updated_at trigger ──────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_conversations_updated_at on public.conversations;

create trigger set_conversations_updated_at
before update on public.conversations
for each row
execute procedure public.set_updated_at();

-- ── 4. Indexes ─────────────────────────────────────────────────────────────

create index if not exists conversations_user_id_idx
on public.conversations (user_id);

create index if not exists conversations_status_idx
on public.conversations (user_id, status);

create index if not exists conversations_last_message_at_idx
on public.conversations (user_id, last_message_at desc);

create index if not exists messages_conversation_id_idx
on public.messages (conversation_id);

create index if not exists messages_created_at_idx
on public.messages (conversation_id, created_at asc);

-- ── 5. Row Level Security: conversations ──────────────────────────────────

alter table public.conversations enable row level security;

drop policy if exists "conversations_select_own" on public.conversations;
drop policy if exists "conversations_insert_own" on public.conversations;
drop policy if exists "conversations_update_own" on public.conversations;
drop policy if exists "conversations_delete_own" on public.conversations;

create policy "conversations_select_own"
on public.conversations
for select
using (auth.uid() = user_id);

create policy "conversations_insert_own"
on public.conversations
for insert
with check (auth.uid() = user_id);

create policy "conversations_update_own"
on public.conversations
for update
using (auth.uid() = user_id);

create policy "conversations_delete_own"
on public.conversations
for delete
using (auth.uid() = user_id);

-- ── 6. Row Level Security: messages ───────────────────────────────────────

alter table public.messages enable row level security;

drop policy if exists "messages_select_own" on public.messages;
drop policy if exists "messages_insert_own" on public.messages;
drop policy if exists "messages_update_own" on public.messages;

create policy "messages_select_own"
on public.messages
for select
using (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
    and c.user_id = auth.uid()
  )
);

create policy "messages_insert_own"
on public.messages
for insert
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
    and c.user_id = auth.uid()
  )
);

create policy "messages_update_own"
on public.messages
for update
using (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
    and c.user_id = auth.uid()
  )
);

-- ── 7. Realtime ────────────────────────────────────────────────────────────

alter table public.conversations replica identity full;
alter table public.messages replica identity full;

alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;