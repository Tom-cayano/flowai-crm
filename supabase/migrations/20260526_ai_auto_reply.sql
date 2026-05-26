-- AI Auto Reply Engine — DB Schema
-- Tables: ai_auto_reply_settings, ai_reply_drafts, ai_reply_feedback, ai_reply_metrics
-- Migration: 20260526_ai_auto_reply.sql

-- ─── 1. ai_auto_reply_settings ────────────────────────────────────────────────
-- Per-user configuration for the AI auto-reply engine.
-- One row per user (unique constraint). Mode drives the entire pipeline behavior.

CREATE TABLE IF NOT EXISTS ai_auto_reply_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    uuid REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Operational mode
  mode            text NOT NULL DEFAULT 'suggest'
                  CHECK (mode IN ('off', 'suggest', 'approval', 'full_auto')),

  -- Confidence thresholds (0.0 – 1.0)
  auto_send_threshold    numeric(4,3) NOT NULL DEFAULT 0.900,  -- ≥ this → auto-send
  approval_threshold     numeric(4,3) NOT NULL DEFAULT 0.700,  -- ≥ this (but < auto_send) → draft
  -- < approval_threshold → handoff to human

  -- Intent-level overrides — blocked from auto-reply regardless of confidence
  blocked_intents text[]  NOT NULL DEFAULT '{}',

  -- Cooldown between AI replies per conversation (seconds)
  cooldown_seconds  int  NOT NULL DEFAULT 30,

  -- Max auto-replies AI can send per conversation per day
  daily_auto_limit  int  NOT NULL DEFAULT 50,

  -- Business hours gate (null = always active; uses UTC if timezone null)
  active_hours_start time,
  active_hours_end   time,
  active_timezone    text NOT NULL DEFAULT 'UTC',

  -- Channels where auto-reply is active
  active_channels text[] NOT NULL DEFAULT '{whatsapp}',

  -- Optional prompt override (null = user default prompt)
  prompt_id  uuid REFERENCES ai_prompts(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(user_id)
);

ALTER TABLE ai_auto_reply_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_auto_reply_settings_own"
  ON ai_auto_reply_settings
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Grant service role full access (workers + admin routes)
GRANT ALL ON ai_auto_reply_settings TO service_role;

-- ─── 2. ai_reply_drafts ───────────────────────────────────────────────────────
-- AI-generated reply drafts awaiting agent approval.
-- Lifecycle: pending → approved | rejected | expired | auto_sent

CREATE TABLE IF NOT EXISTS ai_reply_drafts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,

  -- The AI-generated reply text
  content          text NOT NULL,

  -- Draft status lifecycle
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected','expired','auto_sent')),

  -- AI generation metadata
  confidence       numeric(4,3),
  intent           text,
  model            text,
  prompt_tokens    int,
  completion_tokens int,
  latency_ms       int,

  -- Which incoming message triggered this draft
  trigger_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  trigger_content    text,

  -- Agent action fields (populated on approval/rejection)
  approved_by    uuid REFERENCES auth.users(id),
  approved_at    timestamptz,
  rejection_note text,

  -- Auto-expire pending drafts after 30 minutes (stale drafts must not be sent)
  expires_at     timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_reply_drafts_conv_status
  ON ai_reply_drafts(conversation_id, status);

CREATE INDEX IF NOT EXISTS idx_ai_reply_drafts_user_status
  ON ai_reply_drafts(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_reply_drafts_pending_expires
  ON ai_reply_drafts(expires_at)
  WHERE status = 'pending';

ALTER TABLE ai_reply_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_reply_drafts_own"
  ON ai_reply_drafts
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT ALL ON ai_reply_drafts TO service_role;

-- ─── 3. ai_reply_feedback ─────────────────────────────────────────────────────
-- Thumbs up/down feedback from agents on AI-generated drafts.
-- Used to calculate acceptance rate and trigger auto-escalation after N rejections.

CREATE TABLE IF NOT EXISTS ai_reply_feedback (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id       uuid NOT NULL REFERENCES ai_reply_drafts(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id),

  -- Agent rating
  rating         text NOT NULL
                 CHECK (rating IN ('thumbs_up','thumbs_down','edited')),

  -- If agent edited the AI text before sending, capture the final version
  edited_content text,

  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_reply_feedback_draft
  ON ai_reply_feedback(draft_id);

CREATE INDEX IF NOT EXISTS idx_ai_reply_feedback_user
  ON ai_reply_feedback(user_id, created_at DESC);

ALTER TABLE ai_reply_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_reply_feedback_own"
  ON ai_reply_feedback
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT ALL ON ai_reply_feedback TO service_role;

-- ─── 4. ai_reply_metrics ──────────────────────────────────────────────────────
-- Append-only event log for AI auto-reply analytics.
-- Powers acceptance rate, response time, and fallback frequency metrics.

CREATE TABLE IF NOT EXISTS ai_reply_metrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id    uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  conversation_id uuid,  -- nullable: some events are workspace-level

  -- Event type
  event           text NOT NULL,
  -- Values: draft_created | draft_approved | draft_rejected | draft_expired
  --         auto_sent | handoff_triggered | fallback_approval
  --         confidence_gate_passed | confidence_gate_failed
  --         cooldown_blocked | business_hours_blocked | intent_blocked

  -- Event payload
  mode            text,       -- which mode was active at event time
  confidence      numeric(4,3),
  intent          text,
  latency_ms      int,
  channel         text,       -- whatsapp | instagram | messenger

  occurred_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_reply_metrics_user
  ON ai_reply_metrics(user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_reply_metrics_workspace
  ON ai_reply_metrics(workspace_id, occurred_at DESC)
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_reply_metrics_event
  ON ai_reply_metrics(event, occurred_at DESC);

ALTER TABLE ai_reply_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_reply_metrics_own"
  ON ai_reply_metrics
  FOR ALL
  USING (user_id = auth.uid());

GRANT ALL ON ai_reply_metrics TO service_role;
