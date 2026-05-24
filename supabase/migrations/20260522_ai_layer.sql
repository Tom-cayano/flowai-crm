-- ─────────────────────────────────────────────────────────────────────────────
-- AI orchestration and conversational intelligence tables
-- ─────────────────────────────────────────────────────────────────────────────

-- pgvector extension is required for conversation_embeddings.
-- In Supabase it is available but must be enabled per-project.
create extension if not exists vector;

-- ── AI usage metering ─────────────────────────────────────────────────────────
-- Immutable record of every OpenAI API call — used for billing, quotas, and
-- cost attribution per tenant.
create table if not exists ai_usage_logs (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users(id) on delete cascade,
  conversation_id     uuid,
  model               text        not null,
  operation           text        not null,  -- reply | summary | classify | embed | moderate | qualify | follow_up
  prompt_tokens       int         not null default 0,
  completion_tokens   int         not null default 0,
  total_tokens        int         not null default 0,
  estimated_cost_usd  numeric(12,8) not null default 0,
  latency_ms          int,
  created_at          timestamptz not null default now()
);

create index if not exists ai_usage_logs_user_idx    on ai_usage_logs (user_id, created_at desc);
create index if not exists ai_usage_logs_conv_idx    on ai_usage_logs (conversation_id) where conversation_id is not null;
create index if not exists ai_usage_logs_created_idx on ai_usage_logs (created_at desc);

alter table ai_usage_logs enable row level security;
create policy "Own read"        on ai_usage_logs for select using (auth.uid() = user_id);
create policy "Service write"   on ai_usage_logs for insert with check (auth.role() = 'service_role');

-- ── Conversation embeddings ───────────────────────────────────────────────────
-- Per-message vector embeddings (text-embedding-3-small, 1536 dims).
-- Used for retrieval-augmented context in AI replies.
create table if not exists conversation_embeddings (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  conversation_id uuid        not null,
  message_id      uuid,                         -- whatsapp_messages.id when available
  content         text        not null,
  embedding       vector(1536),
  created_at      timestamptz not null default now()
);

-- IVFFlat index for fast approximate cosine similarity search.
-- lists = 100 is suitable for tables up to ~1M rows.
create index if not exists conversation_embeddings_vector_idx
  on conversation_embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create index if not exists conversation_embeddings_conv_idx
  on conversation_embeddings (conversation_id, created_at desc);

alter table conversation_embeddings enable row level security;
create policy "Own read"      on conversation_embeddings for select using (auth.uid() = user_id);
create policy "Service write" on conversation_embeddings for insert with check (auth.role() = 'service_role');
create policy "Service delete" on conversation_embeddings for delete using (auth.role() = 'service_role');

-- ── AI handoffs ───────────────────────────────────────────────────────────────
-- Records every moment the AI escalated a conversation to a human agent.
create table if not exists ai_handoffs (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users(id) on delete cascade,
  conversation_id     uuid        not null,
  reason              text        not null,  -- explicit_request | sentiment_negative | repeated_failure | low_confidence | intent_unclassified
  confidence          numeric(4,3),          -- AI's confidence score at time of handoff (0-1)
  triggered_message   text,                  -- the customer message that triggered the handoff
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz,
  resolved_by         uuid        references auth.users(id) on delete set null
);

create index if not exists ai_handoffs_conv_idx  on ai_handoffs (conversation_id, created_at desc);
create index if not exists ai_handoffs_user_idx  on ai_handoffs (user_id, created_at desc);
create index if not exists ai_handoffs_unresolved on ai_handoffs (user_id) where resolved_at is null;

alter table ai_handoffs enable row level security;
create policy "Own read"       on ai_handoffs for select using (auth.uid() = user_id);
create policy "Own resolve"    on ai_handoffs for update using (auth.uid() = user_id);
create policy "Service all"    on ai_handoffs for all using (auth.role() = 'service_role');

-- ── AI feedback ───────────────────────────────────────────────────────────────
-- Agent or contact ratings on AI-generated responses — feeds the analytics loop.
create table if not exists ai_feedback (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users(id) on delete cascade,
  conversation_id     uuid        not null,
  ai_response_text    text,
  rating              smallint    check (rating between 1 and 5),
  feedback_text       text,
  created_at          timestamptz not null default now()
);

create index if not exists ai_feedback_user_idx on ai_feedback (user_id, created_at desc);
create index if not exists ai_feedback_conv_idx on ai_feedback (conversation_id);

alter table ai_feedback enable row level security;
create policy "Own read"    on ai_feedback for select using (auth.uid() = user_id);
create policy "Own write"   on ai_feedback for insert with check (auth.uid() = user_id);
create policy "Service all" on ai_feedback for all  using (auth.role() = 'service_role');

-- ── Vector similarity search function ─────────────────────────────────────────
-- Callable via supabase.rpc('match_conversation_embeddings', {...})
create or replace function match_conversation_embeddings(
  p_user_id         uuid,
  p_conversation_id uuid,
  p_query_embedding vector(1536),
  p_match_count     int  default 5,
  p_exclude_conv    boolean default true    -- if true, search ACROSS other conversations (RAG from history)
)
returns table (
  content    text,
  similarity float
)
language sql stable
as $$
  select
    ce.content,
    1 - (ce.embedding <=> p_query_embedding) as similarity
  from conversation_embeddings ce
  where
    ce.user_id = p_user_id
    and (not p_exclude_conv or ce.conversation_id <> p_conversation_id)
    and ce.embedding is not null
  order by ce.embedding <=> p_query_embedding
  limit p_match_count;
$$;
