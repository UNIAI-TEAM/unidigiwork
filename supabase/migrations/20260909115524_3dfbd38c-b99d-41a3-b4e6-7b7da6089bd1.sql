ALTER TABLE public.work_product_shares
  ADD COLUMN IF NOT EXISTS shared_with_user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE public.work_product_shares ALTER COLUMN workspace_id DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.work_product_shares
    ADD CONSTRAINT wps_status_chk CHECK (status IN ('ACTIVE','REVOKED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.work_product_shares
    ADD CONSTRAINT wps_target_chk CHECK (
      (workspace_id IS NOT NULL AND shared_with_user_id IS NULL)
      OR (workspace_id IS NULL AND shared_with_user_id IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.work_product_shares DROP CONSTRAINT IF EXISTS work_product_shares_work_product_id_workspace_id_key;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS wps_uniq_workspace
  ON public.work_product_shares (work_product_id, workspace_id)
  WHERE workspace_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wps_uniq_user
  ON public.work_product_shares (work_product_id, shared_with_user_id)
  WHERE shared_with_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS wps_user_idx ON public.work_product_shares (shared_with_user_id);

CREATE OR REPLACE FUNCTION public.wp_share_allows(_work_product_id uuid, _kind text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.work_product_shares s
    WHERE s.work_product_id = _work_product_id
      AND s.status = 'ACTIVE'
      AND (s.expires_at IS NULL OR s.expires_at > now())
      AND (
        (s.workspace_id IS NOT NULL AND public.is_workspace_member(s.workspace_id, auth.uid()))
        OR (s.shared_with_user_id IS NOT NULL AND s.shared_with_user_id = public.current_internal_user_id())
      )
      AND (_kind = 'view' OR s.permission = 'EDIT')
  );
$$;

DROP POLICY IF EXISTS wps_select ON public.work_product_shares;
CREATE POLICY wps_select ON public.work_product_shares
  FOR SELECT TO authenticated
  USING (
    (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()))
    OR shared_with_user_id = public.current_internal_user_id()
    OR public.can_edit_work_product(work_product_id)
  );