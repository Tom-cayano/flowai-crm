-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: WhatsApp engine schema
--
--   1. session_health_events   — connection history audit log
--   2. messages — add media columns to existing CRM table
--   3. whatsapp-media storage bucket
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. session_health_events ─────────────────────────────────────────────────
-- Immutable log of every connection state change for an instance.
-- Written by the connection processor and session monitor.

create table if not exists public.session_health_events (
  id           uuid        primary key default gen_random_uuid(),
  instance_id  uuid        references public.whatsapp_instances(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  event_type   text        not null,  -- e.g. "connection_open", "state_mismatch_repaired"
  from_state   text,                  -- previous state (null on first event)
  to_state     text        not null,
  metadata     jsonb       not null default '{}',
  created_at   timestamptz not null default now()
);

create index if not exists idx_session_health_events_instance
  on public.session_health_events (instance_id, created_at desc);

create index if not exists idx_session_health_events_user
  on public.session_health_events (user_id, created_at desc);

alter table public.session_health_events enable row level security;

create policy "she_select_own" on public.session_health_events
  for select using (auth.uid() = user_id);

-- ── 2. messages — media columns ──────────────────────────────────────────────
-- The CRM messages table currently stores only text.
-- Add optional media fields so the chat UI can render images and files.

alter table public.messages
  add column if not exists media_url       text,
  add column if not exists media_mime_type text,
  add column if not exists thumbnail_url   text;

-- ── 3. Supabase Storage bucket for WhatsApp media ────────────────────────────
-- Creates the bucket if it does not already exist.
-- Policy: only authenticated users can read/write their own files
-- (path prefix = user UUID).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whatsapp-media',
  'whatsapp-media',
  false,  -- private by default; public URLs are signed or via CDN
  52428800, -- 50 MB per file
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm',
    'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac',
    'application/pdf', 'application/zip',
    'application/octet-stream'
  ]
)
on conflict (id) do nothing;

-- Allow authenticated users to upload files under their own user_id prefix
create policy if not exists "wm_storage_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'whatsapp-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy if not exists "wm_storage_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'whatsapp-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy if not exists "wm_storage_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'whatsapp-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Service role (admin client / workers) needs unrestricted access
create policy if not exists "wm_storage_service_role"
  on storage.objects
  to service_role
  using (bucket_id = 'whatsapp-media')
  with check (bucket_id = 'whatsapp-media');
