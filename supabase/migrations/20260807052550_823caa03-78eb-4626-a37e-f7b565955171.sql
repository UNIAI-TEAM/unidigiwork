CREATE TABLE public.workflow_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  role tenant_role NOT NULL,
  can_edit boolean NOT NULL DEFAULT false,
  can_publish boolean NOT NULL DEFAULT false,
  can_run boolean NOT NULL DEFAULT true,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, role)
);

GRANT SELECT ON public.workflow_role_permissions TO authenticated;
GRANT ALL ON public.workflow_role_permissions TO service_role;
ALTER TABLE public.workflow_role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY workflow_role_permissions_select ON public.workflow_role_permissions
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER workflow_role_permissions_updated_at
  BEFORE UPDATE ON public.workflow_role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Effective permissions: individual override > role rule > default (owner = full, others = run only)
CREATE OR REPLACE FUNCTION public.set_workflow_role_permission(_workspace_id uuid, _role tenant_role, _can_edit boolean, _can_publish boolean, _can_run boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tenant uuid; _id uuid; _before jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT public.can_manage_workflow_permissions(_workspace_id) THEN
    RAISE EXCEPTION 'WORKFLOW_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT tenant_id INTO _tenant FROM public.workspaces WHERE id = _workspace_id AND deleted_at IS NULL;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND' USING ERRCODE='P0002'; END IF;

  SELECT jsonb_build_object('can_edit', r.can_edit, 'can_publish', r.can_publish, 'can_run', r.can_run, 'is_default', false)
    INTO _before
  FROM public.workflow_role_permissions r
  WHERE r.workspace_id = _workspace_id AND r.role = _role;

  IF _before IS NULL THEN
    _before := jsonb_build_object('can_edit', false, 'can_publish', false, 'can_run', true, 'is_default', true);
  END IF;

  INSERT INTO public.workflow_role_permissions (tenant_id, workspace_id, role, can_edit, can_publish, can_run, granted_by)
  VALUES (_tenant, _workspace_id, _role, COALESCE(_can_edit,false), COALESCE(_can_publish,false), COALESCE(_can_run,true), auth.uid())
  ON CONFLICT (workspace_id, role) DO UPDATE
    SET can_edit = EXCLUDED.can_edit,
        can_publish = EXCLUDED.can_publish,
        can_run = EXCLUDED.can_run,
        granted_by = auth.uid(),
        updated_at = now()
  RETURNING id INTO _id;

  INSERT INTO public.audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, before_state, after_state, source)
  VALUES (_tenant, auth.uid(), 'workflow_permission.role_set', 'workspace', _workspace_id::text,
          _before || jsonb_build_object('role', _role::text),
          jsonb_build_object('role', _role::text, 'can_edit', COALESCE(_can_edit,false), 'can_publish', COALESCE(_can_publish,false), 'can_run', COALESCE(_can_run,true), 'is_default', false),
          'app');
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.reset_workflow_role_permission(_workspace_id uuid, _role tenant_role)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int; _before jsonb; _tenant uuid;
BEGIN
  IF NOT public.can_manage_workflow_permissions(_workspace_id) THEN
    RAISE EXCEPTION 'WORKFLOW_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT tenant_id INTO _tenant FROM public.workspaces WHERE id = _workspace_id;

  SELECT jsonb_build_object('can_edit', r.can_edit, 'can_publish', r.can_publish, 'can_run', r.can_run, 'is_default', false)
    INTO _before
  FROM public.workflow_role_permissions r
  WHERE r.workspace_id = _workspace_id AND r.role = _role;

  DELETE FROM public.workflow_role_permissions WHERE workspace_id = _workspace_id AND role = _role;
  GET DIAGNOSTICS _n = ROW_COUNT;

  IF _n > 0 THEN
    INSERT INTO public.audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, before_state, after_state, source)
    VALUES (_tenant, auth.uid(), 'workflow_permission.role_reset', 'workspace', _workspace_id::text,
            COALESCE(_before,'{}'::jsonb) || jsonb_build_object('role', _role::text),
            jsonb_build_object('role', _role::text, 'can_edit', false, 'can_publish', false, 'can_run', true, 'is_default', true),
            'app');
  END IF;
  RETURN _n > 0;
END $$;

CREATE OR REPLACE FUNCTION public.list_workflow_role_permissions(_workspace_id uuid)
RETURNS TABLE (role text, can_edit boolean, can_publish boolean, can_run boolean, member_count bigint, is_configured boolean, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _tenant uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT w.tenant_id INTO _tenant FROM public.workspaces w WHERE w.id = _workspace_id;

  RETURN QUERY
  SELECT r.role::text,
         COALESCE(p.can_edit, false),
         COALESCE(p.can_publish, false),
         COALESCE(p.can_run, true),
         COALESCE(c.n, 0)::bigint,
         (p.id IS NOT NULL),
         p.updated_at
  FROM unnest(enum_range(NULL::tenant_role)) AS r(role)
  LEFT JOIN public.workflow_role_permissions p
    ON p.workspace_id = _workspace_id AND p.role = r.role
  LEFT JOIN LATERAL (
    SELECT count(*) AS n
    FROM public.workspace_members wm
    JOIN public.tenant_members tm ON tm.user_id = wm.user_id AND tm.tenant_id = _tenant AND tm.status = 'active'
    WHERE wm.workspace_id = _workspace_id AND tm.role = r.role
  ) c ON true
  ORDER BY array_position(enum_range(NULL::tenant_role)::text[], r.role::text);
END $$;

DROP FUNCTION IF EXISTS public.list_workflow_permissions(uuid);
CREATE OR REPLACE FUNCTION public.list_workflow_permissions(_workspace_id uuid)
RETURNS TABLE (
  user_id uuid, display_name text, email text, workspace_role text, tenant_role text,
  is_owner boolean, can_edit boolean, can_publish boolean, can_run boolean,
  source text, updated_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _tenant uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT w.tenant_id INTO _tenant FROM public.workspaces w WHERE w.id = _workspace_id;

  RETURN QUERY
  SELECT
    wm.user_id,
    u.display_name,
    u.primary_email,
    wm.role,
    tm.role::text,
    (w.owner_id = wm.user_id) AS is_owner,
    COALESCE(p.can_edit, rp.can_edit, w.owner_id = wm.user_id) AS can_edit,
    COALESCE(p.can_publish, rp.can_publish, w.owner_id = wm.user_id) AS can_publish,
    COALESCE(p.can_run, rp.can_run, true) AS can_run,
    CASE WHEN w.owner_id = wm.user_id THEN 'owner'
         WHEN p.id IS NOT NULL THEN 'individual'
         WHEN rp.id IS NOT NULL THEN 'role'
         ELSE 'default' END AS source,
    COALESCE(p.updated_at, rp.updated_at)
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  LEFT JOIN public.users u ON u.id = wm.user_id
  LEFT JOIN public.tenant_members tm ON tm.user_id = wm.user_id AND tm.tenant_id = _tenant AND tm.status = 'active'
  LEFT JOIN public.workflow_permissions p
    ON p.workspace_id = wm.workspace_id AND p.user_id = wm.user_id
  LEFT JOIN public.workflow_role_permissions rp
    ON rp.workspace_id = wm.workspace_id AND rp.role = tm.role
  WHERE wm.workspace_id = _workspace_id
  ORDER BY (w.owner_id = wm.user_id) DESC, COALESCE(u.display_name, u.primary_email, '');
END $$;

DROP FUNCTION IF EXISTS public.list_workflow_permission_audit(uuid, int);
CREATE OR REPLACE FUNCTION public.list_workflow_permission_audit(_workspace_id uuid, _limit int DEFAULT 50)
RETURNS TABLE (
  id uuid, occurred_at timestamptz, action text, actor_id uuid, actor_name text,
  target_user_id uuid, target_name text, target_role text, before_state jsonb, after_state jsonb
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT e.id, e.occurred_at, e.action, e.actor_user_id,
         COALESCE(au.display_name, au.primary_email),
         NULLIF(e.after_state->>'user_id','')::uuid,
         COALESCE(tu.display_name, tu.primary_email),
         e.after_state->>'role',
         e.before_state, e.after_state
  FROM public.audit_events e
  LEFT JOIN public.users au ON au.id = e.actor_user_id
  LEFT JOIN public.users tu ON tu.id = NULLIF(e.after_state->>'user_id','')::uuid
  WHERE e.resource_type = 'workspace'
    AND e.resource_id = _workspace_id::text
    AND e.action IN ('workflow_permission.set','workflow_permission.reset','workflow_permission.role_set','workflow_permission.role_reset')
  ORDER BY e.occurred_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit,50), 200));
END $$;

REVOKE EXECUTE ON FUNCTION public.set_workflow_role_permission(uuid, tenant_role, boolean, boolean, boolean) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reset_workflow_role_permission(uuid, tenant_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_workflow_role_permissions(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_workflow_permissions(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.list_workflow_permission_audit(uuid, int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_workflow_role_permission(uuid, tenant_role, boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_workflow_role_permission(uuid, tenant_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_workflow_role_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_workflow_permissions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_workflow_permission_audit(uuid, int) TO authenticated;