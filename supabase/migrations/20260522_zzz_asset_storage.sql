-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: workspace-assets Supabase Storage bucket + RLS policies + audit table
-- File: 20260522_zzz_asset_storage.sql
--
-- ORDERING NOTE: This file is named with the _zzz_ prefix so it sorts AFTER
-- all other 20260522_* migrations. It DEPENDS on these tables from
-- 20260522_saas_layer.sql:
--   • workspaces          (columns: id, owner_id, is_active)
--   • workspace_members   (columns: id, workspace_id, user_id, is_active, role)
--
-- Do NOT rename this file to a lexicographically earlier position.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- What this migration does:
--   1. Creates the `workspace-assets` Storage bucket (public CDN reads)
--   2. Adds workspace-scoped RLS policies on storage.objects
--      — Write: only authenticated owner or active workspace member
--      — Read:  public (bucket is public — no auth needed for GET)
--   3. Creates the `asset_uploads` audit table with its own RLS
--
-- Path convention enforced in app code: {workspaceId}/{category}/{uuid}.webp
-- RLS checks that split_part(name,'/',1) matches a workspace the caller belongs to.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Create bucket (idempotent) ───────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'workspace-assets',
  'workspace-assets',
  true,             -- public reads (CDN-safe — no signed URLs required for GET)
  10485760,         -- 10 MB hard cap in storage layer (app enforces 8 MB earlier)
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET
    public             = EXCLUDED.public,
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── 2. Storage RLS policies ─────────────────────────────────────────────────
--
-- Column layout of storage.objects used here:
--   name       TEXT  — full storage path, e.g. "{workspace_id}/logo/abc123.webp"
--   bucket_id  TEXT  — always 'workspace-assets' in these policies
--   owner      UUID  — set by Supabase to auth.uid() at INSERT time
--
-- Tenant isolation: split_part(name, '/', 1) extracts the workspaceId prefix.
-- We cast it to UUID and look it up in the public.workspaces / workspace_members
-- tables, which are guaranteed to exist because 20260522_saas_layer.sql ran first.

-- INSERT: caller must be workspace owner or an active member
DROP POLICY IF EXISTS "workspace_assets_insert" ON storage.objects;
CREATE POLICY "workspace_assets_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'workspace-assets'
    AND (
      -- Workspace owner
      EXISTS (
        SELECT 1
        FROM public.workspaces w
        WHERE w.id       = split_part(name, '/', 1)::uuid
          AND w.owner_id = auth.uid()
          AND w.is_active = TRUE
      )
      OR
      -- Active workspace member (any role)
      EXISTS (
        SELECT 1
        FROM public.workspace_members m
        WHERE m.workspace_id = split_part(name, '/', 1)::uuid
          AND m.user_id      = auth.uid()
          AND m.is_active    = TRUE
      )
    )
  );

-- UPDATE (upsert): owner or admin/manager member only
DROP POLICY IF EXISTS "workspace_assets_update" ON storage.objects;
CREATE POLICY "workspace_assets_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'workspace-assets'
    AND (
      EXISTS (
        SELECT 1
        FROM public.workspaces w
        WHERE w.id       = split_part(name, '/', 1)::uuid
          AND w.owner_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.workspace_members m
        WHERE m.workspace_id = split_part(name, '/', 1)::uuid
          AND m.user_id      = auth.uid()
          AND m.is_active    = TRUE
          AND m.role         IN ('owner', 'admin')
      )
    )
  );

-- DELETE: owner or admin member only
DROP POLICY IF EXISTS "workspace_assets_delete" ON storage.objects;
CREATE POLICY "workspace_assets_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'workspace-assets'
    AND (
      EXISTS (
        SELECT 1
        FROM public.workspaces w
        WHERE w.id       = split_part(name, '/', 1)::uuid
          AND w.owner_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1
        FROM public.workspace_members m
        WHERE m.workspace_id = split_part(name, '/', 1)::uuid
          AND m.user_id      = auth.uid()
          AND m.is_active    = TRUE
          AND m.role         IN ('owner', 'admin')
      )
    )
  );

-- SELECT: public read — bucket is public, so authenticated + anon both allowed
DROP POLICY IF EXISTS "workspace_assets_select" ON storage.objects;
CREATE POLICY "workspace_assets_select"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'workspace-assets');

-- ─── 3. Asset uploads audit table ────────────────────────────────────────────
--
-- Lightweight audit log of every logo/thumbnail/banner uploaded.
-- Populated fire-and-forget from /api/assets/upload via the service role client.
-- workspace_id is NOT a FK into workspaces here — the service role inserts it
-- and we rely on the storage path as the canonical tenant binding.
-- (Adding a FK would create a circular dependency risk if the workspace is
-- deleted before Supabase cascades the storage objects.)

CREATE TABLE IF NOT EXISTS public.asset_uploads (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID        NOT NULL,
  uploaded_by      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category         TEXT        NOT NULL CHECK (category IN ('logo', 'thumbnail', 'banner')),
  storage_path     TEXT        NOT NULL,
  public_url       TEXT        NOT NULL,
  original_name    TEXT,
  mime_type        TEXT,
  size_bytes       INTEGER,
  size_bytes_webp  INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS asset_uploads_workspace_created_idx
  ON public.asset_uploads (workspace_id, created_at DESC);

-- ─── 4. RLS on audit table ────────────────────────────────────────────────────

ALTER TABLE public.asset_uploads ENABLE ROW LEVEL SECURITY;

-- Workspace owners and active members can see their own workspace uploads
DROP POLICY IF EXISTS "asset_uploads_select_own" ON public.asset_uploads;
CREATE POLICY "asset_uploads_select_own"
  ON public.asset_uploads
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT id          FROM public.workspaces        WHERE owner_id    = auth.uid()
      UNION ALL
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid() AND is_active = TRUE
    )
  );

-- Only the service role can insert (used by /api/assets/upload server route)
DROP POLICY IF EXISTS "asset_uploads_insert_service" ON public.asset_uploads;
CREATE POLICY "asset_uploads_insert_service"
  ON public.asset_uploads
  FOR INSERT
  TO service_role
  WITH CHECK (TRUE);

-- Grant service role full access
GRANT ALL ON public.asset_uploads TO service_role;

-- ─── 5. Comments ─────────────────────────────────────────────────────────────

COMMENT ON TABLE public.asset_uploads IS
  'Audit log of workspace branding asset uploads (logo, thumbnail, banner). '
  'Populated fire-and-forget by /api/assets/upload. '
  'workspace_id intentionally has no FK to workspaces to avoid cascade ordering issues.';

COMMENT ON COLUMN public.asset_uploads.storage_path IS
  'Full path within workspace-assets bucket: {workspaceId}/{category}/{uuid}.webp';

COMMENT ON COLUMN public.asset_uploads.size_bytes_webp IS
  'Post-conversion WebP size in bytes (after server-side sharp processing). '
  'NULL for SVG pass-throughs.';

COMMENT ON COLUMN public.asset_uploads.size_bytes IS
  'Original uploaded file size in bytes before WebP conversion.';
