-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: profiles table + handle_new_user trigger
--
-- Creates the public.profiles table and a trigger that automatically populates
-- it whenever a new row is inserted into auth.users.  The trigger captures
-- full_name from the user's raw_user_meta_data so OAuth sign-ups and the
-- email/password sign-up flow both get a complete profile on first creation.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Profiles table ────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id          uuid        primary key references auth.users on delete cascade,
  email       text        not null,
  full_name   text,
  avatar_url  text,
  role        text        not null default 'agent'
                          check (role in ('admin', 'agent', 'supervisor')),
  status      text        not null default 'online'
                          check (status in ('online', 'away', 'offline')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);


-- ── 2. Keep updated_at current on every UPDATE ───────────────────────────────

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_profiles_updated_at on public.profiles;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();


-- ── 3. Row-level security ────────────────────────────────────────────────────

alter table public.profiles enable row level security;

-- Each user can read and update only their own profile row.
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);


-- ── 4. handle_new_user — auto-creates a profile on sign-up ──────────────────
--
-- Reads full_name from raw_user_meta_data so it works for:
--   • Email/password sign-up  (data.full_name passed in signUp options)
--   • OAuth providers          (full_name comes from the provider token)

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
