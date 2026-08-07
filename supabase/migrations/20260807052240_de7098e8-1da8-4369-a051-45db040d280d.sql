CREATE OR REPLACE FUNCTION public.set_workflow_permission(_workspace_id uuid, _user_id uuid, _can_edit boolean, _can_publish boolean, _can_run boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tenant uuid; _id uuid; _before jsonb; _owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT public.can_manage_workflow_permissions(_workspace_id) THEN
    RAISE EXCEPTION 'WORKFLOW_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT tenant_id, owner_id INTO _tenant, _owner FROM public.workspaces WHERE id = _workspace_id AND deleted_at IS NULL;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = _workspace_id AND user_id = _user_id) THEN
    RAISE EXCEPTION 'WORKSPACE_MEMBER_NOT_FOUND' USING ERRCODE='P0002';
  END IF;

  SELECT jsonb_build_object('can_edit', p.can_edit, 'can_publish', p.can_publish, 'can_run', p.can_run, 'is_default', false)
    INTO _before
  FROM public.workflow_permissions p
  WHERE p.workspace_id = _workspace_id AND p.user_id = _user_id;

  IF _before IS NULL THEN
    _before := jsonb_build_object('can_edit', (_owner = _user_id), 'can_publish', (_owner = _user_id), 'can_run', true, 'is_default', true);
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

  INSERT INTO public.audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, before_state, after_state, source)
  VALUES (_tenant, auth.uid(), 'workflow_permission.set', 'workspace', _workspace_id::text,
          _before || jsonb_build_object('user_id', _user_id),
          jsonb_build_object('user_id', _user_id, 'can_edit', COALESCE(_can_edit,false), 'can_publish', COALESCE(_can_publish,false), 'can_run', COALESCE(_can_run,true), 'is_default', false),
          'app');
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.reset_workflow_permission(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int; _before jsonb; _tenant uuid; _owner uuid;
BEGIN
  IF NOT public.can_manage_workflow_permissions(_workspace_id) THEN
    RAISE EXCEPTION 'WORKFLOW_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT tenant_id, owner_id INTO _tenant, _owner FROM public.workspaces WHERE id = _workspace_id;

  SELECT jsonb_build_object('can_edit', p.can_edit, 'can_publish', p.can_publish, 'can_run', p.can_run, 'is_default', false)
    INTO _before
  FROM public.workflow_permissions p
  WHERE p.workspace_id = _workspace_id AND p.user_id = _user_id;

  DELETE FROM public.workflow_permissions WHERE workspace_id = _workspace_id AND user_id = _user_id;
  GET DIAGNOSTICS _n = ROW_COUNT;

  IF _n > 0 THEN
    INSERT INTO public.audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, before_state, after_state, source)
    VALUES (_tenant, auth.uid(), 'workflow_permission.reset', 'workspace', _workspace_id::text,
            COALESCE(_before,'{}'::jsonb) || jsonb_build_object('user_id', _user_id),
            jsonb_build_object('user_id', _user_id, 'can_edit', (_owner = _user_id), 'can_publish', (_owner = _user_id), 'can_run', true, 'is_default', true),
            'app');
  END IF;
  RETURN _n > 0;
END $$;

CREATE OR REPLACE FUNCTION public.list_workflow_permission_audit(_workspace_id uuid, _limit int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  occurred_at timestamptz,
  action text,
  actor_id uuid,
  actor_name text,
  target_user_id uuid,
  target_name text,
  before_state jsonb,
  after_state jsonb
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT e.id,
         e.occurred_at,
         e.action,
         e.actor_user_id,
         COALESCE(au.display_name, au.primary_email),
         (e.after_state->>'user_id')::uuid,
         COALESCE(tu.display_name, tu.primary_email),
         e.before_state,
         e.after_state
  FROM public.audit_events e
  LEFT JOIN public.users au ON au.id = e.actor_user_id
  LEFT JOIN public.users tu ON tu.id = NULLIF(e.after_state->>'user_id','')::uuid
  WHERE e.resource_type = 'workspace'
    AND e.resource_id = _workspace_id::text
    AND e.action IN ('workflow_permission.set','workflow_permission.reset')
  ORDER BY e.occurred_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit,50), 200));
END $$;

GRANT EXECUTE ON FUNCTION public.list_workflow_permission_audit(uuid, int) TO authenticated;