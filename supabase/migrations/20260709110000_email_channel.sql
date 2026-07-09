-- =============================================================================
-- Migration: canal Email nativo (Resend) — multi-tenant
--
--   1. email_settings  — configuración por usuario/organización (API key de
--                        Resend propia, remitente, secreto del webhook)
--   2. email_templates — plantillas HTML editables con variables {{...}}
--   3. email_logs      — un registro por envío con tracking completo
--                        (entregado / abierto / click / rebote) vía webhooks
--                        oficiales de Resend
-- =============================================================================

create table if not exists public.email_settings (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null unique references auth.users(id) on delete cascade,
  resend_api_key      text,
  from_email          text,                    -- "hola@lovefitnessmurcia.com"
  from_name           text,                    -- "Love Fitness Murcia"
  reply_to            text,
  -- Firma del webhook de Resend (svix) — whsec_...
  webhook_secret      text,
  enabled             boolean     not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists set_email_settings_updated_at on public.email_settings;
create trigger set_email_settings_updated_at
  before update on public.email_settings
  for each row execute procedure public.set_updated_at();

alter table public.email_settings enable row level security;
drop policy if exists "es_select_own" on public.email_settings;
drop policy if exists "es_insert_own" on public.email_settings;
drop policy if exists "es_update_own" on public.email_settings;
create policy "es_select_own" on public.email_settings for select using (auth.uid() = user_id);
create policy "es_insert_own" on public.email_settings for insert with check (auth.uid() = user_id);
create policy "es_update_own" on public.email_settings for update using (auth.uid() = user_id);

-- ── Plantillas ────────────────────────────────────────────────────────────────
create table if not exists public.email_templates (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  slug        text        not null,             -- bienvenida | reserva | ...
  name        text        not null,
  subject     text        not null,             -- admite {{variables}}
  body_html   text        not null,             -- contenido interior (se envuelve en layout responsive)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, slug)
);

drop trigger if exists set_email_templates_updated_at on public.email_templates;
create trigger set_email_templates_updated_at
  before update on public.email_templates
  for each row execute procedure public.set_updated_at();

alter table public.email_templates enable row level security;
drop policy if exists "et_all_own" on public.email_templates;
create policy "et_all_own" on public.email_templates for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Logs de envío + tracking ──────────────────────────────────────────────────
create table if not exists public.email_logs (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users(id) on delete cascade,
  contact_id       uuid        references public.contacts(id) on delete set null,
  conversation_id  uuid        references public.conversations(id) on delete set null,
  template_slug    text,
  to_email         text        not null,
  subject          text        not null,
  -- id de Resend — clave para correlacionar los webhooks
  resend_email_id  text,
  status           text        not null default 'queued'
                   check (status in ('queued','sent','delivered','delayed','bounced','complained','failed')),
  opened_at        timestamptz,
  clicked_at       timestamptz,
  delivered_at     timestamptz,
  bounced_at       timestamptz,
  error            text,
  attempts         integer     not null default 0,
  origin           text        not null default 'automation',  -- automation | manual | reminder | test
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists set_email_logs_updated_at on public.email_logs;
create trigger set_email_logs_updated_at
  before update on public.email_logs
  for each row execute procedure public.set_updated_at();

create index if not exists email_logs_user_idx on public.email_logs (user_id, created_at desc);
create unique index if not exists email_logs_resend_id_idx on public.email_logs (resend_email_id) where resend_email_id is not null;

alter table public.email_logs enable row level security;
drop policy if exists "el_select_own" on public.email_logs;
create policy "el_select_own" on public.email_logs for select using (auth.uid() = user_id);
