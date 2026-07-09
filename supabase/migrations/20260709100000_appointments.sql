-- =============================================================================
-- Migration: appointments — citas del asistente comercial
--
-- Valoraciones gratuitas (online: videollamada/llamada) y clases de prueba
-- (gimnasio presencial) reservadas automáticamente por el asistente.
--
--   • Anti doble-reserva: índice único por (user_id, scheduled_at) sobre
--     citas activas — dos leads nunca pueden ocupar el mismo hueco.
--   • Recordatorios: flags 24 h / 1 h que marca el cron del worker.
--   • Google Calendar: event_id + meet_link cuando la integración está
--     configurada (degradación elegante si no lo está).
-- =============================================================================

create table if not exists public.appointments (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users(id) on delete cascade,
  contact_id       uuid        references public.contacts(id) on delete set null,
  conversation_id  uuid        references public.conversations(id) on delete set null,

  -- valoracion_video | valoracion_llamada | clase_prueba
  kind             text        not null
                   check (kind in ('valoracion_video', 'valoracion_llamada', 'clase_prueba')),

  scheduled_at     timestamptz not null,
  duration_minutes integer     not null default 15,

  status           text        not null default 'confirmed'
                   check (status in ('confirmed', 'completed', 'cancelled', 'no_show')),

  -- Datos del lead en el momento de reservar (histórico inmutable)
  contact_name     text        not null default '',
  contact_phone    text        not null default '',
  goal             text,
  lead_source      text,

  -- Google Calendar (null si la integración no está configurada)
  calendar_event_id text,
  meet_link         text,

  -- Recordatorios automáticos
  reminder_24h_sent_at timestamptz,
  reminder_1h_sent_at  timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists set_appointments_updated_at on public.appointments;
create trigger set_appointments_updated_at
  before update on public.appointments
  for each row execute procedure public.set_updated_at();

-- Anti doble-reserva: un único hueco activo por usuario y hora
create unique index if not exists appointments_no_double_booking
  on public.appointments (user_id, scheduled_at)
  where status = 'confirmed';

create index if not exists appointments_user_upcoming
  on public.appointments (user_id, scheduled_at)
  where status = 'confirmed';

create index if not exists appointments_contact_idx
  on public.appointments (contact_id)
  where contact_id is not null;

alter table public.appointments enable row level security;

drop policy if exists "appointments_select_own" on public.appointments;
drop policy if exists "appointments_insert_own" on public.appointments;
drop policy if exists "appointments_update_own" on public.appointments;
drop policy if exists "appointments_delete_own" on public.appointments;

create policy "appointments_select_own" on public.appointments
  for select using (auth.uid() = user_id);
create policy "appointments_insert_own" on public.appointments
  for insert with check (auth.uid() = user_id);
create policy "appointments_update_own" on public.appointments
  for update using (auth.uid() = user_id);
create policy "appointments_delete_own" on public.appointments
  for delete using (auth.uid() = user_id);

-- El asistente (service_role desde worker/Vercel) bypassa RLS automáticamente.
