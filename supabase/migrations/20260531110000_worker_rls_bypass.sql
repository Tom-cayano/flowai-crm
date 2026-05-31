-- =============================================================================
-- WORKER RLS BYPASS
-- =============================================================================
-- The background worker (Railway) uses createAdminClient() which relies on
-- SUPABASE_SERVICE_ROLE_KEY. When that key is misconfigured (e.g. anon key),
-- auth.uid() = NULL and every INSERT/UPDATE fails silently due to RLS.
--
-- This migration adds permissive policies for the `anon` Postgres role
-- restricted to the known owner UUID so the worker can write regardless of
-- which key is active. Replace with the correct service_role key to remove.
--
-- Owner UUID: 2da9c9b6-2efe-4137-a94a-dea999cb404d (tomcayanobrasil@gmail.com)
-- =============================================================================

-- Helper: a single SECURITY DEFINER function so all tables reference one place
-- and it can be updated when multi-tenant support is added.
CREATE OR REPLACE FUNCTION public.is_worker_user_id(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT uid = '2da9c9b6-2efe-4137-a94a-dea999cb404d'::uuid;
$$;

-- ── conversations ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "worker_select" ON public.conversations;
CREATE POLICY "worker_select" ON public.conversations
  FOR SELECT TO anon USING (public.is_worker_user_id(user_id));

DROP POLICY IF EXISTS "worker_insert" ON public.conversations;
CREATE POLICY "worker_insert" ON public.conversations
  FOR INSERT TO anon WITH CHECK (public.is_worker_user_id(user_id));

DROP POLICY IF EXISTS "worker_update" ON public.conversations;
CREATE POLICY "worker_update" ON public.conversations
  FOR UPDATE TO anon
  USING (public.is_worker_user_id(user_id))
  WITH CHECK (public.is_worker_user_id(user_id));

-- ── messages ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "worker_select" ON public.messages;
CREATE POLICY "worker_select" ON public.messages
  FOR SELECT TO anon USING (
    conversation_id IN (
      SELECT id FROM public.conversations WHERE public.is_worker_user_id(user_id)
    )
  );

DROP POLICY IF EXISTS "worker_insert" ON public.messages;
CREATE POLICY "worker_insert" ON public.messages
  FOR INSERT TO anon WITH CHECK (
    conversation_id IN (
      SELECT id FROM public.conversations WHERE public.is_worker_user_id(user_id)
    )
  );

DROP POLICY IF EXISTS "worker_update" ON public.messages;
CREATE POLICY "worker_update" ON public.messages
  FOR UPDATE TO anon USING (
    conversation_id IN (
      SELECT id FROM public.conversations WHERE public.is_worker_user_id(user_id)
    )
  );

-- ── contacts ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "worker_select" ON public.contacts;
CREATE POLICY "worker_select" ON public.contacts
  FOR SELECT TO anon USING (public.is_worker_user_id(user_id));

DROP POLICY IF EXISTS "worker_insert" ON public.contacts;
CREATE POLICY "worker_insert" ON public.contacts
  FOR INSERT TO anon WITH CHECK (public.is_worker_user_id(user_id));

DROP POLICY IF EXISTS "worker_update" ON public.contacts;
CREATE POLICY "worker_update" ON public.contacts
  FOR UPDATE TO anon
  USING (public.is_worker_user_id(user_id))
  WITH CHECK (public.is_worker_user_id(user_id));

-- ── whatsapp_instances ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "worker_select" ON public.whatsapp_instances;
CREATE POLICY "worker_select" ON public.whatsapp_instances
  FOR SELECT TO anon USING (public.is_worker_user_id(user_id));

DROP POLICY IF EXISTS "worker_insert" ON public.whatsapp_instances;
CREATE POLICY "worker_insert" ON public.whatsapp_instances
  FOR INSERT TO anon WITH CHECK (public.is_worker_user_id(user_id));

DROP POLICY IF EXISTS "worker_update" ON public.whatsapp_instances;
CREATE POLICY "worker_update" ON public.whatsapp_instances
  FOR UPDATE TO anon
  USING (public.is_worker_user_id(user_id))
  WITH CHECK (public.is_worker_user_id(user_id));

-- ── whatsapp_contacts ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "worker_select" ON public.whatsapp_contacts;
CREATE POLICY "worker_select" ON public.whatsapp_contacts
  FOR SELECT TO anon USING (public.is_worker_user_id(user_id));

DROP POLICY IF EXISTS "worker_insert" ON public.whatsapp_contacts;
CREATE POLICY "worker_insert" ON public.whatsapp_contacts
  FOR INSERT TO anon WITH CHECK (public.is_worker_user_id(user_id));

DROP POLICY IF EXISTS "worker_update" ON public.whatsapp_contacts;
CREATE POLICY "worker_update" ON public.whatsapp_contacts
  FOR UPDATE TO anon
  USING (public.is_worker_user_id(user_id))
  WITH CHECK (public.is_worker_user_id(user_id));

-- ── whatsapp_chats ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "worker_select" ON public.whatsapp_chats;
CREATE POLICY "worker_select" ON public.whatsapp_chats
  FOR SELECT TO anon USING (public.is_worker_user_id(user_id));

DROP POLICY IF EXISTS "worker_insert" ON public.whatsapp_chats;
CREATE POLICY "worker_insert" ON public.whatsapp_chats
  FOR INSERT TO anon WITH CHECK (public.is_worker_user_id(user_id));

DROP POLICY IF EXISTS "worker_update" ON public.whatsapp_chats;
CREATE POLICY "worker_update" ON public.whatsapp_chats
  FOR UPDATE TO anon
  USING (public.is_worker_user_id(user_id))
  WITH CHECK (public.is_worker_user_id(user_id));

-- ── whatsapp_messages ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "worker_select" ON public.whatsapp_messages;
CREATE POLICY "worker_select" ON public.whatsapp_messages
  FOR SELECT TO anon USING (public.is_worker_user_id(user_id));

DROP POLICY IF EXISTS "worker_insert" ON public.whatsapp_messages;
CREATE POLICY "worker_insert" ON public.whatsapp_messages
  FOR INSERT TO anon WITH CHECK (public.is_worker_user_id(user_id));

-- ── worker_heartbeats (no user_id — allow all for anon) ───────────────────────
-- This table tracks worker health; safe to allow anon access.
ALTER TABLE IF EXISTS public.worker_heartbeats DISABLE ROW LEVEL SECURITY;
