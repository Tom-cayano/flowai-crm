-- ─────────────────────────────────────────────────────────────────────────────
-- Observability, reliability, and operational infrastructure tables
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Dead-letter queue ─────────────────────────────────────────────────────────
-- Permanent record of BullMQ jobs that exhausted all retries.
-- Written by worker (service role); replayed by ops API.
create table if not exists job_failures (
  id              uuid primary key default gen_random_uuid(),
  queue_name      text        not null,
  job_id          text        not null,
  job_name        text        not null,
  data            jsonb,
  opts            jsonb,
  error           text,
  stack_trace     text,
  attempts_made   int         not null default 0,
  failed_at       timestamptz not null default now(),
  -- replay tracking
  replayed_at     timestamptz,
  replayed_by     uuid        references auth.users(id) on delete set null,
  replay_job_id   text,
  -- tenant context extracted from job payload when available
  user_id         uuid        references auth.users(id) on delete set null,
  correlation_id  text
);

create index if not exists job_failures_queue_name_idx on job_failures (queue_name);
create index if not exists job_failures_failed_at_idx  on job_failures (failed_at desc);
create index if not exists job_failures_user_id_idx    on job_failures (user_id)
  where user_id is not null;

-- RLS: authenticated users see all failures (ops is global); writes via service role
alter table job_failures enable row level security;

create policy "Authenticated read"  on job_failures for select
  using (auth.role() = 'authenticated');
create policy "Service role write"  on job_failures for insert
  with check (auth.role() = 'service_role');
create policy "Service role update" on job_failures for update
  using (auth.role() = 'service_role');

-- ── Metrics snapshots ─────────────────────────────────────────────────────────
-- Periodic queue-depth + throughput samples taken by the worker every 60 seconds.
-- Used for trend sparklines and throughput histograms in the ops dashboard.
create table if not exists metrics_snapshots (
  id              uuid        primary key default gen_random_uuid(),
  captured_at     timestamptz not null default now(),
  queue_name      text        not null,
  waiting         int         not null default 0,
  active          int         not null default 0,
  completed       int         not null default 0,
  failed          int         not null default 0,
  delayed         int         not null default 0,
  throughput_1h   int         not null default 0,
  avg_latency_ms  int
);

create index if not exists metrics_snapshots_queue_captured_idx
  on metrics_snapshots (queue_name, captured_at desc);

-- TTL: auto-delete samples older than 7 days to prevent unbounded growth
-- (done by the worker's periodic cleanup, not a trigger, for simplicity)

alter table metrics_snapshots enable row level security;
create policy "Authenticated read" on metrics_snapshots for select
  using (auth.role() = 'authenticated');
create policy "Service role write" on metrics_snapshots for insert
  with check (auth.role() = 'service_role');

-- ── Audit logs ────────────────────────────────────────────────────────────────
-- Immutable record of all user-initiated state changes.
create table if not exists audit_logs (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        references auth.users(id) on delete set null,
  action        text        not null,  -- e.g. "automation.activated"
  resource_type text        not null,  -- e.g. "automation"
  resource_id   text,
  metadata      jsonb,
  ip_address    text,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index if not exists audit_logs_user_id_idx    on audit_logs (user_id, created_at desc);
create index if not exists audit_logs_resource_idx   on audit_logs (resource_type, resource_id);
create index if not exists audit_logs_created_at_idx on audit_logs (created_at desc);

alter table audit_logs enable row level security;
create policy "Own records" on audit_logs for select
  using (auth.uid() = user_id);
create policy "Service role all" on audit_logs for all
  using (auth.role() = 'service_role');

-- ── Worker heartbeats ─────────────────────────────────────────────────────────
-- Each worker process writes a heartbeat row every 30s.
-- Ops dashboard uses absence of recent heartbeat as a crash indicator.
create table if not exists worker_heartbeats (
  id          uuid        primary key default gen_random_uuid(),
  worker_id   text        not null unique,  -- hostname:pid
  queues      text[]      not null,
  started_at  timestamptz not null,
  last_beat   timestamptz not null default now(),
  version     text
);

alter table worker_heartbeats enable row level security;
create policy "Authenticated read"  on worker_heartbeats for select
  using (auth.role() = 'authenticated');
create policy "Service role write"  on worker_heartbeats for insert
  with check (auth.role() = 'service_role');
create policy "Service role update" on worker_heartbeats for update
  using (auth.role() = 'service_role');

-- ── Rate-limit events ─────────────────────────────────────────────────────────
-- Records when the automation rate limiter rejects an execution.
-- Useful for identifying abusive or misconfigured automations.
create table if not exists rate_limit_events (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  automation_id uuid,
  conversation_id uuid,
  triggered_at  timestamptz not null default now(),
  window_count  int         not null default 0
);

create index if not exists rate_limit_events_user_idx on rate_limit_events (user_id, triggered_at desc);

alter table rate_limit_events enable row level security;
create policy "Own records" on rate_limit_events for select
  using (auth.uid() = user_id);
create policy "Service role all" on rate_limit_events for all
  using (auth.role() = 'service_role');
