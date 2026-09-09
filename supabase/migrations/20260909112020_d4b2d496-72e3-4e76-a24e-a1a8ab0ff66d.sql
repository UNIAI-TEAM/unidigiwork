CREATE TABLE IF NOT EXISTS public.work_product_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_product_id uuid NOT NULL REFERENCES public.work_products(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  permission text NOT NULL DEFAULT 'VIEW' CHECK (permission IN ('VIEW','EDIT')),
  note text,
  shared_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_product_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS work_product_shares_ws_idx ON public.work_product_shares(workspace_id);
CREATE INDEX IF NOT EXISTS work_product_shares_wp_idx ON public.work_product_shares(work_product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_product_shares TO authenticated;
GRANT ALL ON public.work_product_shares TO service_role;

ALTER TABLE public.work_product_shares ENABLE ROW LEVEL SECURITY;

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
      AND public.is_workspace_member(s.workspace_id, auth.uid())
      AND (_kind = 'view' OR s.permission = 'EDIT')
  );
$$;

CREATE POLICY wps_select ON public.work_product_shares
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.can_edit_work_product(work_product_id));

CREATE POLICY wps_insert ON public.work_product_shares
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_work_product(work_product_id));

CREATE POLICY wps_update ON public.work_product_shares
  FOR UPDATE TO authenticated
  USING (public.can_edit_work_product(work_product_id))
  WITH CHECK (public.can_edit_work_product(work_product_id));

CREATE POLICY wps_delete ON public.work_product_shares
  FOR DELETE TO authenticated
  USING (public.can_edit_work_product(work_product_id));

CREATE TRIGGER work_product_shares_updated_at
  BEFORE UPDATE ON public.work_product_shares
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS work_products_select ON public.work_products;
CREATE POLICY work_products_select ON public.work_products
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND (
      public.wp_scope_allows(tenant_id, workspace_id, owner_id, created_by, 'view')
      OR public.wp_share_allows(id, 'view')
    )
  );

DROP POLICY IF EXISTS work_products_update ON public.work_products;
CREATE POLICY work_products_update ON public.work_products
  FOR UPDATE TO authenticated
  USING (
    public.wp_scope_allows(tenant_id, workspace_id, owner_id, created_by, 'edit')
    OR public.wp_share_allows(id, 'edit')
  )
  WITH CHECK (
    public.is_tenant_member(tenant_id)
    OR public.wp_share_allows(id, 'edit')
  );

CREATE OR REPLACE FUNCTION public.can_view_work_product(_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.work_products wp
    WHERE wp.id = _id
      AND wp.deleted_at IS NULL
      AND (
        public.wp_scope_allows(wp.tenant_id, wp.workspace_id, wp.owner_id, wp.created_by, 'view')
        OR public.wp_share_allows(wp.id, 'view')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_work_product(_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.work_products wp
    WHERE wp.id = _id
      AND wp.deleted_at IS NULL
      AND (
        public.wp_scope_allows(wp.tenant_id, wp.workspace_id, wp.owner_id, wp.created_by, 'edit')
        OR public.wp_share_allows(wp.id, 'edit')
      )
  );
$$;