-- ==============================================================================
-- RLS RECURSION FIX for Workspaces & Workspace Members
-- Fixes "infinite recursion detected in policy for relation workspace_members"
-- Creates a SECURITY DEFINER function to bypass RLS during policy evaluation.
-- ==============================================================================

-- 1. Create a helper function that executes with definer privileges to bypass RLS
CREATE OR REPLACE FUNCTION public.get_authorized_workspaces()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  -- Owned workspaces
  SELECT id 
  FROM workspaces 
  WHERE owner_id = auth.uid()
  
  UNION
  
  -- Member workspaces
  SELECT workspace_id 
  FROM workspace_members 
  WHERE user_id = auth.uid() AND is_active = true;
$$;

-- 2. Update Workspaces Policy
DROP POLICY IF EXISTS "workspace_select" ON public.workspaces;
CREATE POLICY "workspace_select" ON public.workspaces FOR SELECT
  USING (
    owner_id = auth.uid()
    OR id IN (SELECT public.get_authorized_workspaces())
  );

-- 3. Update Workspace Members Policy
DROP POLICY IF EXISTS "members_select" ON public.workspace_members;
CREATE POLICY "members_select" ON public.workspace_members FOR SELECT
  USING (
    workspace_id IN (SELECT public.get_authorized_workspaces())
  );

-- Note: We do NOT need to update "members_insert", "members_update", or "members_delete"
-- because those policies only check the `workspaces` table for owner_id matching, 
-- which does not query `workspace_members` and thus doesn't cause recursion.
