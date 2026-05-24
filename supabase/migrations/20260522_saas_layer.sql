-- ============================================================
-- SaaS Monetization, RBAC, Workspace & Onboarding Layer
-- ============================================================

-- ─── Plans ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id                    TEXT PRIMARY KEY,  -- 'starter' | 'pro' | 'agency' | 'enterprise'
  name                  TEXT NOT NULL,
  description           TEXT,
  price_monthly         INTEGER NOT NULL DEFAULT 0,   -- cents
  price_yearly          INTEGER NOT NULL DEFAULT 0,   -- cents
  stripe_price_monthly  TEXT,
  stripe_price_yearly   TEXT,
  -- quotas
  max_seats             INTEGER NOT NULL DEFAULT 1,
  max_messages_monthly  INTEGER NOT NULL DEFAULT 1000,
  max_ai_credits        INTEGER NOT NULL DEFAULT 500,
  max_automations       INTEGER NOT NULL DEFAULT 10,
  max_workspaces        INTEGER NOT NULL DEFAULT 1,    -- sub-workspaces (agency)
  -- features
  features              JSONB NOT NULL DEFAULT '[]',
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO plans (id, name, description, price_monthly, price_yearly, max_seats, max_messages_monthly, max_ai_credits, max_automations, max_workspaces, features, sort_order) VALUES
('starter',    'Starter',    'Para equipos pequeños',           2900,  29000,  1,  1000,   500,   10,   1, '["whatsapp","ai_replies","basic_automations","inbox"]', 1),
('pro',        'Pro',        'Para equipos en crecimiento',     7900,  79000,  5,  5000,   2000,  50,   1, '["whatsapp","ai_replies","advanced_automations","inbox","analytics","bulk_messaging","api_access"]', 2),
('agency',     'Agency',     'Para agencias y equipos grandes', 19900, 199000, 25, 25000,  10000, 500,  10, '["whatsapp","ai_replies","advanced_automations","inbox","analytics","bulk_messaging","api_access","white_label","sub_workspaces","agency_dashboard"]', 3),
('enterprise', 'Enterprise', 'Para grandes corporaciones',      0,     0,      999,999999, 999999,9999, 999, '["whatsapp","ai_replies","advanced_automations","inbox","analytics","bulk_messaging","api_access","white_label","sub_workspaces","agency_dashboard","sso","custom_integrations","sla"]', 4)
ON CONFLICT (id) DO NOTHING;

-- ─── Workspaces ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id       UUID REFERENCES workspaces(id) ON DELETE SET NULL, -- agency sub-workspace
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  plan_id         TEXT NOT NULL REFERENCES plans(id) DEFAULT 'starter',
  is_agency       BOOLEAN NOT NULL DEFAULT FALSE,
  -- Stripe
  stripe_customer_id    TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  subscription_status   TEXT NOT NULL DEFAULT 'trialing',   -- trialing|active|past_due|canceled|unpaid
  trial_ends_at         TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  -- billing interval
  billing_interval      TEXT NOT NULL DEFAULT 'monthly',    -- monthly|yearly
  -- branding (white label)
  logo_url        TEXT,
  primary_color   TEXT NOT NULL DEFAULT '#10b981',
  company_name    TEXT,
  custom_domain   TEXT UNIQUE,
  support_email   TEXT,
  -- metadata
  timezone        TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  locale          TEXT NOT NULL DEFAULT 'pt-BR',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create workspace for each new user (via existing handle_new_user trigger or here)
CREATE INDEX IF NOT EXISTS workspaces_owner_id_idx ON workspaces(owner_id);
CREATE INDEX IF NOT EXISTS workspaces_parent_id_idx ON workspaces(parent_id);
CREATE INDEX IF NOT EXISTS workspaces_slug_idx ON workspaces(slug);

-- ─── Workspace members + RBAC ────────────────────────────────

CREATE TABLE IF NOT EXISTS workspace_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            workspace_role NOT NULL DEFAULT 'agent',
  -- granular permission overrides (null = inherit from role)
  permissions     JSONB,
  -- profile within workspace
  display_name    TEXT,
  avatar_url      TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at    TIMESTAMPTZ,
  invited_by      UUID REFERENCES auth.users(id),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS workspace_members_workspace_id_idx ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS workspace_members_user_id_idx ON workspace_members(user_id);

-- ─── Invitations ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            workspace_role NOT NULL DEFAULT 'agent',
  token           TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by      UUID NOT NULL REFERENCES auth.users(id),
  accepted_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, email)
);

CREATE INDEX IF NOT EXISTS invitations_token_idx ON workspace_invitations(token);
CREATE INDEX IF NOT EXISTS invitations_email_idx ON workspace_invitations(email);

-- ─── Billing events (audit log) ───────────────────────────────
CREATE TABLE IF NOT EXISTS billing_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,    -- 'subscription.created', 'invoice.paid', etc.
  stripe_event_id TEXT UNIQUE,
  payload         JSONB NOT NULL DEFAULT '{}',
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS billing_events_workspace_id_idx ON billing_events(workspace_id);

-- ─── Usage records (per billing period) ──────────────────────
CREATE TABLE IF NOT EXISTS usage_records (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  period_start            TIMESTAMPTZ NOT NULL,
  period_end              TIMESTAMPTZ NOT NULL,
  messages_sent           INTEGER NOT NULL DEFAULT 0,
  ai_credits_used         INTEGER NOT NULL DEFAULT 0,
  automations_executed    INTEGER NOT NULL DEFAULT 0,
  active_seats            INTEGER NOT NULL DEFAULT 0,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, period_start)
);

CREATE INDEX IF NOT EXISTS usage_records_workspace_period_idx ON usage_records(workspace_id, period_start DESC);

-- ─── Onboarding progress ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_progress (
  workspace_id        UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  -- step completion flags
  whatsapp_connected  BOOLEAN NOT NULL DEFAULT FALSE,
  first_message_sent  BOOLEAN NOT NULL DEFAULT FALSE,
  ai_configured       BOOLEAN NOT NULL DEFAULT FALSE,
  team_member_invited BOOLEAN NOT NULL DEFAULT FALSE,
  automation_created  BOOLEAN NOT NULL DEFAULT FALSE,
  billing_setup       BOOLEAN NOT NULL DEFAULT FALSE,
  -- wizard state
  wizard_completed    BOOLEAN NOT NULL DEFAULT FALSE,
  wizard_dismissed    BOOLEAN NOT NULL DEFAULT FALSE,
  current_step        INTEGER NOT NULL DEFAULT 0,
  completed_at        TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Templates marketplace ────────────────────────────────────
CREATE TYPE IF NOT EXISTS template_type AS ENUM ('workflow', 'prompt', 'campaign', 'canned_response');

CREATE TABLE IF NOT EXISTS templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID REFERENCES workspaces(id) ON DELETE SET NULL,  -- NULL = system template
  type            template_type NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  category        TEXT NOT NULL DEFAULT 'general',  -- sales, support, marketing, etc.
  tags            TEXT[] NOT NULL DEFAULT '{}',
  thumbnail_url   TEXT,
  content         JSONB NOT NULL,    -- workflow JSON, prompt text, etc.
  is_public       BOOLEAN NOT NULL DEFAULT FALSE,
  is_featured     BOOLEAN NOT NULL DEFAULT FALSE,
  install_count   INTEGER NOT NULL DEFAULT 0,
  rating_sum      INTEGER NOT NULL DEFAULT 0,
  rating_count    INTEGER NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS templates_type_idx ON templates(type);
CREATE INDEX IF NOT EXISTS templates_public_featured_idx ON templates(is_public, is_featured);
CREATE INDEX IF NOT EXISTS templates_category_idx ON templates(category);

CREATE TABLE IF NOT EXISTS template_installs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  installed_by    UUID NOT NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_id, workspace_id)
);

CREATE TABLE IF NOT EXISTS template_ratings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(template_id, workspace_id)
);

-- ─── Customer success — health scores ────────────────────────
CREATE TABLE IF NOT EXISTS workspace_health (
  workspace_id          UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  health_score          INTEGER NOT NULL DEFAULT 50,     -- 0–100
  login_score           INTEGER NOT NULL DEFAULT 0,      -- 0–25
  message_score         INTEGER NOT NULL DEFAULT 0,      -- 0–25
  ai_score              INTEGER NOT NULL DEFAULT 0,      -- 0–25
  automation_score      INTEGER NOT NULL DEFAULT 0,      -- 0–25
  churn_risk            TEXT NOT NULL DEFAULT 'medium',  -- low|medium|high|critical
  activation_score      INTEGER NOT NULL DEFAULT 0,      -- % of onboarding complete
  last_active_at        TIMESTAMPTZ,
  days_since_last_login INTEGER,
  messages_last_7_days  INTEGER NOT NULL DEFAULT 0,
  ai_calls_last_7_days  INTEGER NOT NULL DEFAULT 0,
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Feature flags (plan gating) ─────────────────────────────
CREATE TABLE IF NOT EXISTS feature_flags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  flag            TEXT NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  override_reason TEXT,
  set_by          UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, flag)
);

-- ─── RLS policies ─────────────────────────────────────────────
ALTER TABLE workspaces             ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invitations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records          ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_progress    ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates              ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_installs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_ratings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_health       ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags          ENABLE ROW LEVEL SECURITY;

-- Workspace: owner or member can read
CREATE POLICY "workspace_select" ON workspaces FOR SELECT
  USING (
    owner_id = auth.uid()
    OR id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = TRUE)
  );

CREATE POLICY "workspace_update" ON workspaces FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "workspace_insert" ON workspaces FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Workspace members: members of same workspace
CREATE POLICY "members_select" ON workspace_members FOR SELECT
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = TRUE
  ) OR workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()));

CREATE POLICY "members_insert" ON workspace_members FOR INSERT
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()));

CREATE POLICY "members_update" ON workspace_members FOR UPDATE
  USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()));

CREATE POLICY "members_delete" ON workspace_members FOR DELETE
  USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()));

-- Invitations: owner/admin can manage
CREATE POLICY "invitations_select" ON workspace_invitations FOR SELECT
  USING (workspace_id IN (
    SELECT id FROM workspaces WHERE owner_id = auth.uid()
  ) OR email = (SELECT email FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "invitations_insert" ON workspace_invitations FOR INSERT
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()));

CREATE POLICY "invitations_delete" ON workspace_invitations FOR DELETE
  USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()));

-- Usage + billing: owner only
CREATE POLICY "usage_select" ON usage_records FOR SELECT
  USING (workspace_id IN (
    SELECT id FROM workspaces WHERE owner_id = auth.uid()
    UNION
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND is_active = TRUE
  ));

CREATE POLICY "billing_events_select" ON billing_events FOR SELECT
  USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()));

-- Onboarding: workspace member
CREATE POLICY "onboarding_select" ON onboarding_progress FOR SELECT
  USING (workspace_id IN (
    SELECT id FROM workspaces WHERE owner_id = auth.uid()
    UNION
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "onboarding_update" ON onboarding_progress FOR UPDATE
  USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()));

-- Templates: public or own workspace
CREATE POLICY "templates_select" ON templates FOR SELECT
  USING (is_public = TRUE OR workspace_id IN (
    SELECT id FROM workspaces WHERE owner_id = auth.uid()
    UNION
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "templates_insert" ON templates FOR INSERT
  WITH CHECK (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()));

CREATE POLICY "templates_update" ON templates FOR UPDATE
  USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid())
    OR (workspace_id IS NULL AND auth.uid() IS NOT NULL));

-- Template installs: own workspace
CREATE POLICY "installs_select" ON template_installs FOR SELECT
  USING (workspace_id IN (
    SELECT id FROM workspaces WHERE owner_id = auth.uid()
    UNION
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "installs_insert" ON template_installs FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT id FROM workspaces WHERE owner_id = auth.uid()
    UNION
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

-- Template ratings: same
CREATE POLICY "ratings_select" ON template_ratings FOR SELECT USING (TRUE);
CREATE POLICY "ratings_insert" ON template_ratings FOR INSERT
  WITH CHECK (workspace_id IN (
    SELECT id FROM workspaces WHERE owner_id = auth.uid()
  ));

-- Health: owner
CREATE POLICY "health_select" ON workspace_health FOR SELECT
  USING (workspace_id IN (SELECT id FROM workspaces WHERE owner_id = auth.uid()));

-- Feature flags: workspace members
CREATE POLICY "flags_select" ON feature_flags FOR SELECT
  USING (workspace_id IN (
    SELECT id FROM workspaces WHERE owner_id = auth.uid()
    UNION
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

-- ─── Helper function: workspace of user ──────────────────────
CREATE OR REPLACE FUNCTION get_user_workspace(p_user_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT id FROM workspaces WHERE owner_id = p_user_id LIMIT 1;
$$;

-- ─── Increment usage helper ───────────────────────────────────
CREATE OR REPLACE FUNCTION increment_usage(
  p_workspace_id  UUID,
  p_field         TEXT,
  p_amount        INTEGER DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_period_start TIMESTAMPTZ := DATE_TRUNC('month', NOW());
  v_period_end   TIMESTAMPTZ := DATE_TRUNC('month', NOW()) + INTERVAL '1 month';
BEGIN
  INSERT INTO usage_records (workspace_id, period_start, period_end)
  VALUES (p_workspace_id, v_period_start, v_period_end)
  ON CONFLICT (workspace_id, period_start) DO NOTHING;

  EXECUTE format(
    'UPDATE usage_records SET %I = %I + $1, updated_at = NOW() WHERE workspace_id = $2 AND period_start = $3',
    p_field, p_field
  ) USING p_amount, p_workspace_id, v_period_start;
END;
$$;

-- ─── Seed system workflow templates ──────────────────────────
INSERT INTO templates (type, name, description, category, tags, is_public, is_featured, content)
VALUES
(
  'workflow',
  'Bienvenida automática',
  'Envía un mensaje de bienvenida cuando un nuevo contacto inicia una conversación.',
  'support',
  ARRAY['bienvenida', 'onboarding', 'automatico'],
  TRUE, TRUE,
  '{"nodes":[{"id":"n1","type":"trigger","position":{"x":250,"y":50},"data":{"triggerConfig":{"type":"first_message"}}},{"id":"n2","type":"action","position":{"x":250,"y":200},"data":{"actionConfig":{"type":"send_message","message":"¡Hola {{contact_name}}! Bienvenido/a. ¿En qué podemos ayudarte hoy?"}}}],"edges":[{"id":"e1","source":"n1","target":"n2"}],"version":1}'
),
(
  'workflow',
  'Seguimiento sin respuesta',
  'Contacta al cliente si no ha respondido en 24 horas.',
  'sales',
  ARRAY['followup', 'ventas', 'reactivacion'],
  TRUE, TRUE,
  '{"nodes":[{"id":"n1","type":"trigger","position":{"x":250,"y":50},"data":{"triggerConfig":{"type":"no_response_timeout","timeoutMinutes":1440}}},{"id":"n2","type":"action","position":{"x":250,"y":200},"data":{"actionConfig":{"type":"send_message","message":"Hola, quisimos verificar si pudimos resolver tu consulta. ¿Necesitas ayuda adicional?"}}}],"edges":[{"id":"e1","source":"n1","target":"n2"}],"version":1}'
),
(
  'workflow',
  'Clasificación de leads por score',
  'Asigna automáticamente leads calientes a un agente senior.',
  'sales',
  ARRAY['leads', 'clasificacion', 'asignacion'],
  TRUE, TRUE,
  '{"nodes":[{"id":"n1","type":"trigger","position":{"x":250,"y":50},"data":{"triggerConfig":{"type":"lead_score_threshold","scoreThreshold":75,"scoreDirection":"above"}}},{"id":"n2","type":"action","position":{"x":250,"y":200},"data":{"actionConfig":{"type":"add_tag","tag":"hot-lead"}}},{"id":"n3","type":"action","position":{"x":250,"y":350},"data":{"actionConfig":{"type":"assign_agent"}}}],"edges":[{"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n2","target":"n3"}],"version":1}'
),
(
  'prompt',
  'Vendedor consultivo',
  'Sistema de IA orientado a la venta consultiva con técnica SPIN.',
  'sales',
  ARRAY['ventas', 'consultivo', 'spin', 'ia'],
  TRUE, TRUE,
  '{"text":"Eres un vendedor consultivo experto. Tu objetivo es entender las necesidades del cliente usando la técnica SPIN (Situación, Problema, Implicación, Necesidad). Haz preguntas abiertas, escucha activamente y propón soluciones adaptadas. Nunca presiones — guía con valor."}'
),
(
  'prompt',
  'Soporte técnico empático',
  'IA de soporte técnico con tono empático y resolución de problemas paso a paso.',
  'support',
  ARRAY['soporte', 'tecnico', 'empatia', 'ia'],
  TRUE, TRUE,
  '{"text":"Eres un agente de soporte técnico experto y empático. Escucha el problema del cliente con comprensión, luego guía paso a paso hacia la solución. Si no sabes la respuesta, sé honesto y escala al equipo. Siempre cierra verificando que el problema fue resuelto."}'
),
(
  'campaign',
  'Reactivación de clientes inactivos',
  'Secuencia de 3 mensajes para reconectar con clientes que no han interactuado en 30 días.',
  'marketing',
  ARRAY['reactivacion', 'campana', 'inactivos'],
  TRUE, FALSE,
  '{"messages":[{"day":0,"text":"¡Hola {{name}}! Te extrañamos. ¿Podemos ayudarte en algo?"},{"day":2,"text":"{{name}}, tenemos novedades que podrían interesarte. ¿Charlamos?"},{"day":5,"text":"Última vez que te contactamos. Si necesitas algo, aquí estaremos siempre."}]}'
)
ON CONFLICT DO NOTHING;
