-- =============================================================================
-- FASE 7 — Configuración editable del recepcionista comercial.
--
-- Mueve a Supabase (editable, no hardcodeado) por usuario/organización:
-- horarios, precios, promociones, clase de prueba, FAQs, enlaces y mensaje
-- de bienvenida. El asistente lee esta config con fallback a los valores por
-- defecto del código (comportamiento idéntico si no hay fila).
-- =============================================================================

create table if not exists public.sales_config (
  user_id       uuid        primary key references auth.users(id) on delete cascade,
  -- Enlaces oficiales de cierre (nunca cruzados)
  link_gym      text        not null default 'https://www.lovefitness.es',
  link_online   text        not null default 'https://www.transformacuerpo.com',
  -- Precio de la clase de prueba (texto libre)
  trial_price   text        not null default '10 €',
  -- Textos editables (null = usar el copy por defecto del código)
  welcome       text,
  pricing_text  text,
  schedule_text text,
  -- FAQs y promociones (jsonb libre)
  faqs          jsonb       not null default '[]',
  promos        jsonb       not null default '[]',
  -- Datos extra editables (objetivos, planes, etc.)
  extra         jsonb       not null default '{}',
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

drop trigger if exists set_sales_config_updated_at on public.sales_config;
create trigger set_sales_config_updated_at
  before update on public.sales_config
  for each row execute procedure public.set_updated_at();

alter table public.sales_config enable row level security;
drop policy if exists "sc_select_own" on public.sales_config;
drop policy if exists "sc_upsert_own" on public.sales_config;
drop policy if exists "sc_update_own" on public.sales_config;
create policy "sc_select_own" on public.sales_config for select using (auth.uid() = user_id);
create policy "sc_upsert_own" on public.sales_config for insert with check (auth.uid() = user_id);
create policy "sc_update_own" on public.sales_config for update using (auth.uid() = user_id);
-- El asistente (service_role) bypassa RLS.
