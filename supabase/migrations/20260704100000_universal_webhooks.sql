-- =============================================================================
-- Migration: Universal webhook integrations
--
-- FlowAI CRM se convierte en centro de automatizaciones: cualquier aplicación
-- externa (Transforma Fit Coach, tiendas, landing pages, APIs...) puede enviar
-- eventos a POST /api/webhooks/leads autenticándose con un Bearer Token
-- (y opcionalmente firma HMAC) generado desde el panel de Integraciones.
--
--   1. webhook_integrations        — una fila por aplicación conectada
--   2. integration_events          — log completo de cada webhook recibido
--   3. integration_security_events — intentos fallidos de autenticación
--   4. contacts.source / contacts.custom_fields — origen + datos flexibles
--
-- Idempotencia: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
--               DROP POLICY IF EXISTS + CREATE POLICY
-- =============================================================================

-- ── Prerequisite: set_updated_at ─────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- 1. webhook_integrations — aplicaciones conectadas
-- =============================================================================
create table if not exists public.webhook_integrations (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,

  -- Nombre visible de la aplicación ("Transforma Fit Coach")
  name          text        not null,
  -- Slug normalizado usado para matching de automatizaciones ("transforma-fit-coach")
  source_key    text        not null,

  -- Bearer token (formato fw_<64 hex>). El endpoint busca por este valor.
  token         text        not null unique,
  -- Secreto HMAC opcional — cuando está definido, se exige x-flowai-signature
  hmac_secret   text,

  enabled       boolean     not null default true,

  -- Etiquetas que se añaden automáticamente a cada contacto de esta integración
  default_tags  text[]      not null default '{}',

  -- Estadísticas de actividad (actualizadas por el endpoint)
  total_events  integer     not null default 0,
  total_errors  integer     not null default 0,
  last_event_at timestamptz,
  last_event_status text,             -- processed | failed | unauthorized
  last_error    text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (user_id, source_key)
);

drop trigger if exists set_webhook_integrations_updated_at on public.webhook_integrations;
create trigger set_webhook_integrations_updated_at
  before update on public.webhook_integrations
  for each row execute procedure public.set_updated_at();

-- Lookup principal del endpoint (token → integración)
create index if not exists webhook_integrations_token_idx
  on public.webhook_integrations (token);

create index if not exists webhook_integrations_user_idx
  on public.webhook_integrations (user_id, created_at desc);

alter table public.webhook_integrations enable row level security;

drop policy if exists "wi_select_own" on public.webhook_integrations;
drop policy if exists "wi_insert_own" on public.webhook_integrations;
drop policy if exists "wi_update_own" on public.webhook_integrations;
drop policy if exists "wi_delete_own" on public.webhook_integrations;

create policy "wi_select_own" on public.webhook_integrations
  for select using (auth.uid() = user_id);
create policy "wi_insert_own" on public.webhook_integrations
  for insert with check (auth.uid() = user_id);
create policy "wi_update_own" on public.webhook_integrations
  for update using (auth.uid() = user_id);
create policy "wi_delete_own" on public.webhook_integrations
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- 2. integration_events — log completo de webhooks recibidos
-- =============================================================================
create table if not exists public.integration_events (
  id              uuid        primary key default gen_random_uuid(),
  integration_id  uuid        not null references public.webhook_integrations(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,

  source          text        not null,             -- source declarado en el payload
  event           text        not null,             -- "lead_created", "purchase", ...
  payload         jsonb       not null default '{}',

  -- Clave de idempotencia opcional (header x-idempotency-key)
  idempotency_key text,

  -- Resultado del procesamiento
  status          text        not null default 'received'
                  check (status in ('received', 'processed', 'failed', 'retrying', 'dead')),
  error           text,
  attempts        integer     not null default 0,

  contact_id      uuid        references public.contacts(id) on delete set null,
  contact_created boolean     not null default false,

  -- Automatizaciones despachadas: [{id, name}]
  automations_triggered jsonb not null default '[]',

  processing_ms   integer,
  created_at      timestamptz not null default now(),
  processed_at    timestamptz
);

-- Dedupe: la misma idempotency key de la misma integración no se procesa dos veces
create unique index if not exists integration_events_idempotency_idx
  on public.integration_events (integration_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists integration_events_integration_idx
  on public.integration_events (integration_id, created_at desc);

create index if not exists integration_events_user_idx
  on public.integration_events (user_id, created_at desc);

create index if not exists integration_events_status_idx
  on public.integration_events (status)
  where status in ('failed', 'retrying');

alter table public.integration_events enable row level security;

drop policy if exists "ie_select_own" on public.integration_events;

create policy "ie_select_own" on public.integration_events
  for select using (auth.uid() = user_id);

-- INSERT/UPDATE los realiza el endpoint con service_role (bypassa RLS).

-- =============================================================================
-- 3. integration_security_events — intentos fallidos / ataques
-- =============================================================================
create table if not exists public.integration_security_events (
  id             uuid        primary key default gen_random_uuid(),
  -- Nullable: un token inválido puede no resolver a ninguna integración
  integration_id uuid        references public.webhook_integrations(id) on delete cascade,
  user_id        uuid        references auth.users(id) on delete cascade,
  ip             text,
  reason         text        not null,   -- invalid_token | invalid_signature | rate_limited | disabled | invalid_payload
  detail         text,
  created_at     timestamptz not null default now()
);

create index if not exists integration_security_events_created_idx
  on public.integration_security_events (created_at desc);

create index if not exists integration_security_events_user_idx
  on public.integration_security_events (user_id, created_at desc)
  where user_id is not null;

alter table public.integration_security_events enable row level security;

drop policy if exists "ise_select_own" on public.integration_security_events;

create policy "ise_select_own" on public.integration_security_events
  for select using (auth.uid() = user_id);

-- =============================================================================
-- 4. contacts — origen del lead + campos flexibles
-- =============================================================================
alter table public.contacts add column if not exists source text;
alter table public.contacts add column if not exists custom_fields jsonb not null default '{}';

create index if not exists contacts_source_idx
  on public.contacts (user_id, source)
  where source is not null;

-- Matching rápido de contactos entrantes por email
create index if not exists contacts_email_idx
  on public.contacts (user_id, email)
  where email is not null;
