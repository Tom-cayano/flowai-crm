-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: contacts table
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ── 1. Contacts table ────────────────────────────────────────────────────────

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade,

  name text not null,
  phone text,
  whatsapp text,
  email text,
  instagram text,
  company text,
  location text,
  notes text,

  status text not null default 'active'
    check (status in ('active', 'inactive', 'blocked')),

  tags text[] not null default '{}',

  last_interaction timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 2. updated_at trigger ───────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_contacts_updated_at on public.contacts;

create trigger set_contacts_updated_at
before update on public.contacts
for each row
execute procedure public.set_updated_at();

-- ── 3. Indexes ──────────────────────────────────────────────────────────────

create index if not exists contacts_user_id_idx
on public.contacts (user_id);

create index if not exists contacts_status_idx
on public.contacts (user_id, status);

create index if not exists contacts_created_at_idx
on public.contacts (user_id, created_at desc);

create index if not exists contacts_name_trgm_idx
on public.contacts
using gin (name gin_trgm_ops);

-- ── 4. Row Level Security ──────────────────────────────────────────────────

alter table public.contacts enable row level security;

drop policy if exists "contacts_select_own" on public.contacts;
drop policy if exists "contacts_insert_own" on public.contacts;
drop policy if exists "contacts_update_own" on public.contacts;
drop policy if exists "contacts_delete_own" on public.contacts;

create policy "contacts_select_own"
on public.contacts
for select
using (auth.uid() = user_id);

create policy "contacts_insert_own"
on public.contacts
for insert
with check (auth.uid() = user_id);

create policy "contacts_update_own"
on public.contacts
for update
using (auth.uid() = user_id);

create policy "contacts_delete_own"
on public.contacts
for delete
using (auth.uid() = user_id);