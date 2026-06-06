-- =============================================================================
-- Migration: Automation tables (consolidated, fully idempotent, Supabase-safe)
--
-- Crea todas las tablas del motor de automatizaciones que nunca fueron
-- aplicadas a la base de datos.
--
-- Compatibilidad: PostgreSQL 15+ / Supabase
-- Idempotencia:   CREATE TABLE IF NOT EXISTS
--                 DROP POLICY IF EXISTS + CREATE POLICY
--                 DROP TRIGGER IF EXISTS + CREATE TRIGGER
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
-- 1. webhook_automations  (legacy rule engine)
-- =============================================================================
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

drop policy if exists "wa_select_own" on public.webhook_automations;
drop policy if exists "wa_insert_own" on public.webhook_automations;
drop policy if exists "wa_update_own" on public.webhook_automations;
drop policy if exists "wa_delete_own" on public.webhook_automations;
-- legacy names used in older migrations
drop policy if exists "automations_select_own" on public.webhook_automations;
drop policy if exists "automations_insert_own" on public.webhook_automations;
drop policy if exists "automations_update_own" on public.webhook_automations;
drop policy if exists "automations_delete_own" on public.webhook_automations;

create policy "wa_select_own" on public.webhook_automations
  for select using (auth.uid() = user_id);
create policy "wa_insert_own" on public.webhook_automations
  for insert with check (auth.uid() = user_id);
create policy "wa_update_own" on public.webhook_automations
  for update using (auth.uid() = user_id);
create policy "wa_delete_own" on public.webhook_automations
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- 2. automations  (visual workflow definitions — DAG stored as JSONB)
-- =============================================================================
create table if not exists public.automations (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  name              text        not null,
  description       text        not null default '',
  status            text        not null default 'draft'
                    check (status in ('active', 'inactive', 'draft')),
  workflow          jsonb       not null default '{"nodes":[],"edges":[],"version":1}',
  trigger_type      text        not null default '',
  execution_count   integer     not null default 0,
  last_triggered_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists set_automations_updated_at on public.automations;
create trigger set_automations_updated_at
  before update on public.automations
  for each row execute procedure public.set_updated_at();

create index if not exists idx_automations_user_status
  on public.automations (user_id, status)
  where status = 'active';

create index if not exists idx_automations_trigger
  on public.automations (user_id, trigger_type)
  where status = 'active';

alter table public.automations enable row level security;

drop policy if exists "automations_select_own" on public.automations;
drop policy if exists "automations_insert_own" on public.automations;
drop policy if exists "automations_update_own" on public.automations;
drop policy if exists "automations_delete_own" on public.automations;

create policy "automations_select_own" on public.automations
  for select using (auth.uid() = user_id);
create policy "automations_insert_own" on public.automations
  for insert with check (auth.uid() = user_id);
create policy "automations_update_own" on public.automations
  for update using (auth.uid() = user_id);
create policy "automations_delete_own" on public.automations
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- 3. automation_executions  (one row per workflow run)
-- =============================================================================
create table if not exists public.automation_executions (
  id              uuid        primary key default gen_random_uuid(),
  automation_id   uuid        not null references public.automations(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  conversation_id uuid        references public.conversations(id) on delete set null,
  contact_id      uuid        references public.contacts(id) on delete set null,
  status          text        not null default 'running'
                  check (status in ('running', 'completed', 'failed', 'cancelled')),
  current_node_id text,
  context         jsonb       not null default '{}',
  error           text,
  started_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists idx_executions_automation
  on public.automation_executions (automation_id, started_at desc);

create index if not exists idx_executions_user
  on public.automation_executions (user_id, started_at desc);

create index if not exists idx_executions_conversation
  on public.automation_executions (conversation_id)
  where conversation_id is not null;

alter table public.automation_executions enable row level security;

drop policy if exists "executions_select_own" on public.automation_executions;

create policy "executions_select_own" on public.automation_executions
  for select using (auth.uid() = user_id);

-- Worker uses service_role key — bypasses RLS for INSERT/UPDATE automatically.

-- =============================================================================
-- 4. automation_step_logs  (per-node audit trail)
-- =============================================================================
create table if not exists public.automation_step_logs (
  id           uuid        primary key default gen_random_uuid(),
  execution_id uuid        not null references public.automation_executions(id) on delete cascade,
  node_id      text        not null,
  node_type    text        not null,
  level        text        not null default 'info'
               check (level in ('debug', 'info', 'warn', 'error')),
  message      text        not null,
  data         jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_step_logs_execution
  on public.automation_step_logs (execution_id, created_at asc);

alter table public.automation_step_logs enable row level security;

drop policy if exists "logs_select_via_execution" on public.automation_step_logs;

create policy "logs_select_via_execution" on public.automation_step_logs
  for select using (
    exists (
      select 1
      from public.automation_executions e
      where e.id = execution_id
        and e.user_id = auth.uid()
    )
  );

-- =============================================================================
-- 5. scheduled_tasks  (wait_delay node resumption queue)
-- =============================================================================
create table if not exists public.scheduled_tasks (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  automation_id uuid        references public.automations(id) on delete cascade,
  execution_id  uuid        references public.automation_executions(id) on delete cascade,
  node_id       text        not null,
  run_at        timestamptz not null,
  payload       jsonb       not null default '{}',
  status        text        not null default 'pending'
                check (status in ('pending', 'running', 'done', 'cancelled')),
  created_at    timestamptz not null default now()
);

create index if not exists idx_scheduled_tasks_run_at
  on public.scheduled_tasks (run_at)
  where status = 'pending';

create index if not exists idx_scheduled_tasks_execution
  on public.scheduled_tasks (execution_id);

alter table public.scheduled_tasks enable row level security;

drop policy if exists "scheduled_tasks_select_own" on public.scheduled_tasks;

create policy "scheduled_tasks_select_own" on public.scheduled_tasks
  for select using (auth.uid() = user_id);

-- =============================================================================
-- 6. ai_prompts  (prompt template library)
-- =============================================================================
create table if not exists public.ai_prompts (
  id             uuid         primary key default gen_random_uuid(),
  user_id        uuid         not null references auth.users(id) on delete cascade,
  name           text         not null,
  description    text         not null default '',
  system_prompt  text         not null,
  model          text         not null default 'gpt-4o-mini',
  max_tokens     integer      not null default 500,
  temperature    numeric(3,2) not null default 0.7,
  is_default     boolean      not null default false,
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now()
);

create unique index if not exists idx_ai_prompts_one_default_per_user
  on public.ai_prompts (user_id)
  where is_default = true;

drop trigger if exists set_ai_prompts_updated_at on public.ai_prompts;
create trigger set_ai_prompts_updated_at
  before update on public.ai_prompts
  for each row execute procedure public.set_updated_at();

alter table public.ai_prompts enable row level security;

drop policy if exists "ai_prompts_select_own" on public.ai_prompts;
drop policy if exists "ai_prompts_insert_own" on public.ai_prompts;
drop policy if exists "ai_prompts_update_own" on public.ai_prompts;
drop policy if exists "ai_prompts_delete_own" on public.ai_prompts;

create policy "ai_prompts_select_own" on public.ai_prompts
  for select using (auth.uid() = user_id);
create policy "ai_prompts_insert_own" on public.ai_prompts
  for insert with check (auth.uid() = user_id);
create policy "ai_prompts_update_own" on public.ai_prompts
  for update using (auth.uid() = user_id);
create policy "ai_prompts_delete_own" on public.ai_prompts
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- 7. contact_scores  (lead scoring)
-- =============================================================================
create table if not exists public.contact_scores (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  contact_id      uuid        not null references public.contacts(id) on delete cascade,
  score           integer     not null default 0,
  events          jsonb       not null default '[]',
  last_updated_at timestamptz not null default now(),
  unique (user_id, contact_id)
);

create index if not exists idx_contact_scores_user
  on public.contact_scores (user_id, score desc);

alter table public.contact_scores enable row level security;

drop policy if exists "contact_scores_select_own" on public.contact_scores;
drop policy if exists "contact_scores_insert_own" on public.contact_scores;
drop policy if exists "contact_scores_update_own" on public.contact_scores;

create policy "contact_scores_select_own" on public.contact_scores
  for select using (auth.uid() = user_id);
create policy "contact_scores_insert_own" on public.contact_scores
  for insert with check (auth.uid() = user_id);
create policy "contact_scores_update_own" on public.contact_scores
  for update using (auth.uid() = user_id);

-- =============================================================================
-- 8. contact_segments  (dynamic contact groups)
-- =============================================================================
create table if not exists public.contact_segments (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  name         text        not null,
  description  text        not null default '',
  rules        jsonb       not null default '{"type":"group","logic":"AND","conditions":[]}',
  member_count integer     not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists set_segments_updated_at on public.contact_segments;
create trigger set_segments_updated_at
  before update on public.contact_segments
  for each row execute procedure public.set_updated_at();

alter table public.contact_segments enable row level security;

drop policy if exists "segments_select_own" on public.contact_segments;
drop policy if exists "segments_insert_own" on public.contact_segments;
drop policy if exists "segments_update_own" on public.contact_segments;
drop policy if exists "segments_delete_own" on public.contact_segments;

create policy "segments_select_own" on public.contact_segments
  for select using (auth.uid() = user_id);
create policy "segments_insert_own" on public.contact_segments
  for insert with check (auth.uid() = user_id);
create policy "segments_update_own" on public.contact_segments
  for update using (auth.uid() = user_id);
create policy "segments_delete_own" on public.contact_segments
  for delete using (auth.uid() = user_id);

-- =============================================================================
-- 9. contact_segment_members  (M2M: contact ↔ segment)
-- =============================================================================
create table if not exists public.contact_segment_members (
  segment_id uuid        not null references public.contact_segments(id) on delete cascade,
  contact_id uuid        not null references public.contacts(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (segment_id, contact_id)
);

create index if not exists idx_segment_members_contact
  on public.contact_segment_members (contact_id);

alter table public.contact_segment_members enable row level security;

drop policy if exists "segment_members_select_own" on public.contact_segment_members;

create policy "segment_members_select_own" on public.contact_segment_members
  for select using (
    exists (
      select 1
      from public.contact_segments s
      where s.id = segment_id
        and s.user_id = auth.uid()
    )
  );

-- =============================================================================
-- Realtime subscriptions
-- =============================================================================
alter table public.automation_executions replica identity full;
alter table public.automation_step_logs   replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.automation_executions;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.automation_step_logs;
exception when duplicate_object then null; end $$;
