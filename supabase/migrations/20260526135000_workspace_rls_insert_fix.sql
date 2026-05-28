-- ==============================================================================
-- WORKSPACE RLS INSERT FIX & AUTO-MEMBER TRIGGER
-- ==============================================================================

-- 1. Trigger to automatically add the owner as a workspace member, 
--    and seed onboarding/health tables securely (bypassing RLS).
CREATE OR REPLACE FUNCTION public.on_workspace_created()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert the owner as the first member with 'owner' role
  INSERT INTO public.workspace_members (workspace_id, user_id, role, is_active)
  VALUES (NEW.id, NEW.owner_id, 'owner', true);
  
  -- Seed onboarding progress and health metrics securely
  INSERT INTO public.onboarding_progress (workspace_id) VALUES (NEW.id);
  INSERT INTO public.workspace_health (workspace_id) VALUES (NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS workspace_created_trigger ON public.workspaces;
CREATE TRIGGER workspace_created_trigger
  AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE PROCEDURE public.on_workspace_created();

-- 2. Fix Workspaces INSERT policy
DROP POLICY IF EXISTS "workspace_insert" ON public.workspaces;
CREATE POLICY "workspace_insert" ON public.workspaces FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- 3. Secure helper for admin privileges without recursion
CREATE OR REPLACE FUNCTION public.get_admin_workspaces()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  -- Workspaces where user is 'owner' or 'admin'
  SELECT workspace_id 
  FROM public.workspace_members 
  WHERE user_id = auth.uid() AND role IN ('owner', 'admin') AND is_active = true
  
  UNION
  
  -- Workspaces owned by the user
  SELECT id 
  FROM public.workspaces 
  WHERE owner_id = auth.uid();
$$;

-- 4. Fix Workspace Members INSERT policy
DROP POLICY IF EXISTS "members_insert" ON public.workspace_members;
CREATE POLICY "members_insert" ON public.workspace_members FOR INSERT
  WITH CHECK (
    -- You can only insert members into workspaces where you have admin/owner rights
    workspace_id IN (SELECT public.get_admin_workspaces())
  );

-- 5. Fix Workspace Members UPDATE policy
DROP POLICY IF EXISTS "members_update" ON public.workspace_members;
CREATE POLICY "members_update" ON public.workspace_members FOR UPDATE
  USING (
    workspace_id IN (SELECT public.get_admin_workspaces())
  );

-- 6. Fix Workspace Members DELETE policy
DROP POLICY IF EXISTS "members_delete" ON public.workspace_members;
CREATE POLICY "members_delete" ON public.workspace_members FOR DELETE
  USING (
    workspace_id IN (SELECT public.get_admin_workspaces())
  );
