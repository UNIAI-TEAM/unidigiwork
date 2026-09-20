CREATE TABLE IF NOT EXISTS public.work_product_access_policies (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  view_scope text NOT NULL DEFAULT 'TENANT' CHECK (view_scope IN ('TENANT','WORKSPACE','OWNER')),
  edit_scope text NOT NULL DEFAULT 'OWNER' CHECK (edit_scope IN ('TENANT','WORKSPACE','OWNER')),
  admin_override boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.work_product_access_policies TO authenticated;
GRANT ALL ON public.work_product_access_policies TO service_role;

ALTER TABLE public.work_product_access_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY wpap_select ON public.work_product_access_policies
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY wpap_insert ON public.work_product_access_policies
  FOR INSERT TO authenticated
  WITH CHECK (public.has_tenant_role(tenant_id, 'tenant_owner') OR public.has_tenant_role(tenant_id, 'tenant_admin'));

CREATE POLICY wpap_update ON public.work_product_access_policies
  FOR UPDATE TO authenticated
  USING (public.has_tenant_role(tenant_id, 'tenant_owner') OR public.has_tenant_role(tenant_id, 'tenant_admin'))
  WITH CHECK (public.has_tenant_role(tenant_id, 'tenant_owner') OR public.has_tenant_role(tenant_id, 'tenant_admin'));

CREATE TRIGGER work_product_access_policies_updated_at
  BEFORE UPDATE ON public.work_product_access_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.wp_access_scope(_tenant_id uuid, _kind text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN _kind = 'view' THEN p.view_scope ELSE p.edit_scope END
       FROM public.work_product_access_policies p WHERE p.tenant_id = _tenant_id),
    CASE WHEN _kind = 'view' THEN 'TENANT' ELSE 'OWNER' END
  );
$$;

CREATE OR REPLACE FUNCTION public.wp_admin_override(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.admin_override FROM public.work_product_access_policies p WHERE p.tenant_id = _tenant_id),
    true
  );
$$;

CREATE OR REPLACE FUNCTION public.wp_scope_allows(
  _tenant_id uuid, _workspace_id uuid, _owner_id uuid, _created_by uuid, _kind text
) RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_tenant_member(_tenant_id) AND (
    (public.wp_admin_override(_tenant_id) AND (
       public.has_tenant_role(_tenant_id, 'tenant_owner') OR public.has_tenant_role(_tenant_id, 'tenant_admin')))
    OR _owner_id = auth.uid()
    OR _created_by = auth.uid()
    OR (public.wp_access_scope(_tenant_id, _kind) = 'TENANT')
    OR (public.wp_access_scope(_tenant_id, _kind) = 'WORKSPACE'
        AND _workspace_id IS NOT NULL
        AND public.is_workspace_member(_workspace_id, auth.uid()))
  );
$$;

DROP POLICY IF EXISTS work_products_select ON public.work_products;
CREATE POLICY work_products_select ON public.work_products
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.wp_scope_allows(tenant_id, workspace_id, owner_id, created_by, 'view'));

DROP POLICY IF EXISTS work_products_update ON public.work_products;
CREATE POLICY work_products_update ON public.work_products
  FOR UPDATE TO authenticated
  USING (public.wp_scope_allows(tenant_id, workspace_id, owner_id, created_by, 'edit'))
  WITH CHECK (public.is_tenant_member(tenant_id));

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
      AND public.wp_scope_allows(wp.tenant_id, wp.workspace_id, wp.owner_id, wp.created_by, 'view')
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
      AND public.wp_scope_allows(wp.tenant_id, wp.workspace_id, wp.owner_id, wp.created_by, 'edit')
  );
$$;