CREATE TABLE public.workflow_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  can_edit boolean NOT NULL DEFAULT false,
  can_publish boolean NOT NULL DEFAULT false,
  can_run boolean NOT NULL DEFAULT true,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

GRANT SELECT ON public.workflow_permissions TO authenticated;
GRANT ALL ON public.workflow_permissions TO service_role;

ALTER TABLE public.workflow_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_permissions_select_members"
  ON public.workflow_permissions FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER workflow_permissions_updated_at
  BEFORE UPDATE ON public.workflow_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.can_manage_workflow_permissions(_workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = _workspace_id AND w.deleted_at IS NULL
      AND (w.owner_id = auth.uid()
           OR public.has_tenant_role(w.tenant_id, 'tenant_owner')
           OR public.has_tenant_role(w.tenant_id, 'tenant_admin'))
  )
$$;

CREATE OR REPLACE FUNCTION public.list_workflow_permissions(_workspace_id uuid)
RETURNS TABLE (
  user_id uuid, display_name text, email text, workspace_role text,
  is_owner boolean, can_edit boolean, can_publish boolean, can_run boolean,
  updated_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT
    wm.user_id,
    u.display_name,
    u.primary_email,
    wm.role,
    (w.owner_id = wm.user_id) AS is_owner,
    COALESCE(p.can_edit, w.owner_id = wm.user_id) AS can_edit,
    COALESCE(p.can_publish, w.owner_id = wm.user_id) AS can_publish,
    COALESCE(p.can_run, true) AS can_run,
    p.updated_at
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  LEFT JOIN public.users u ON u.id = wm.user_id
  LEFT JOIN public.workflow_permissions p
    ON p.workspace_id = wm.workspace_id AND p.user_id = wm.user_id
  WHERE wm.workspace_id = _workspace_id
  ORDER BY (w.owner_id = wm.user_id) DESC, COALESCE(u.display_name, u.primary_email, '');
END $$;

CREATE OR REPLACE FUNCTION public.set_workflow_permission(
  _workspace_id uuid, _user_id uuid,
  _can_edit boolean, _can_publish boolean, _can_run boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tenant uuid; _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT public.can_manage_workflow_permissions(_workspace_id) THEN
    RAISE EXCEPTION 'WORKFLOW_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT tenant_id INTO _tenant FROM public.workspaces WHERE id = _workspace_id AND deleted_at IS NULL;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = _workspace_id AND user_id = _user_id) THEN
    RAISE EXCEPTION 'WORKSPACE_MEMBER_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  INSERT INTO public.workflow_permissions (tenant_id, workspace_id, user_id, can_edit, can_publish, can_run, granted_by)
  VALUES (_tenant, _workspace_id, _user_id, COALESCE(_can_edit,false), COALESCE(_can_publish,false), COALESCE(_can_run,true), auth.uid())
  ON CONFLICT (workspace_id, user_id) DO UPDATE
    SET can_edit = EXCLUDED.can_edit,
        can_publish = EXCLUDED.can_publish,
        can_run = EXCLUDED.can_run,
        granted_by = auth.uid(),
        updated_at = now()
  RETURNING id INTO _id;

  INSERT INTO public.audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, after_state, source)
  VALUES (_tenant, auth.uid(), 'workflow_permission.set', 'workspace', _workspace_id::text,
          jsonb_build_object('user_id', _user_id, 'can_edit', _can_edit, 'can_publish', _can_publish, 'can_run', _can_run),
          'app');
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.reset_workflow_permission(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  IF NOT public.can_manage_workflow_permissions(_workspace_id) THEN
    RAISE EXCEPTION 'WORKFLOW_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  DELETE FROM public.workflow_permissions WHERE workspace_id = _workspace_id AND user_id = _user_id;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n > 0;
END $$;

REVOKE ALL ON FUNCTION public.can_manage_workflow_permissions(uuid) FROM public;
REVOKE ALL ON FUNCTION public.list_workflow_permissions(uuid) FROM public;
REVOKE ALL ON FUNCTION public.set_workflow_permission(uuid, uuid, boolean, boolean, boolean) FROM public;
REVOKE ALL ON FUNCTION public.reset_workflow_permission(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_manage_workflow_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_workflow_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_workflow_permission(uuid, uuid, boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_workflow_permission(uuid, uuid) TO authenticated;