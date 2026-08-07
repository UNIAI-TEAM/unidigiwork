CREATE OR REPLACE FUNCTION public.has_workflow_permission(_workspace_id uuid, _user_id uuid, _action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _w public.workspaces; _tenant uuid; _role public.tenant_role; _v boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO _w FROM public.workspaces WHERE id = _workspace_id;
  IF _w.id IS NULL THEN RETURN false; END IF;
  IF _w.owner_id = _user_id THEN RETURN true; END IF;
  _tenant := _w.tenant_id;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=_workspace_id AND m.user_id=_user_id) THEN
    RETURN false;
  END IF;
  SELECT CASE _action WHEN 'edit' THEN p.can_edit WHEN 'publish' THEN p.can_publish ELSE p.can_run END
    INTO _v FROM public.workflow_permissions p
   WHERE p.workspace_id=_workspace_id AND p.user_id=_user_id;
  IF _v IS NOT NULL THEN RETURN _v; END IF;
  SELECT tm.role INTO _role FROM public.tenant_members tm
   WHERE tm.tenant_id=_tenant AND tm.user_id=_user_id AND tm.status='active';
  IF _role IS NOT NULL THEN
    SELECT CASE _action WHEN 'edit' THEN rp.can_edit WHEN 'publish' THEN rp.can_publish ELSE rp.can_run END
      INTO _v FROM public.workflow_role_permissions rp
     WHERE rp.workspace_id=_workspace_id AND rp.role=_role;
    IF _v IS NOT NULL THEN RETURN _v; END IF;
  END IF;
  RETURN _action = 'run';
END $$;

REVOKE ALL ON FUNCTION public.has_workflow_permission(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_workflow_permission(uuid,uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_workflow_permissions(_workspace_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _u uuid := auth.uid();
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object(
    'workspace_id', _workspace_id,
    'is_owner', EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id=_workspace_id AND w.owner_id=_u),
    'can_edit', public.has_workflow_permission(_workspace_id,_u,'edit'),
    'can_publish', public.has_workflow_permission(_workspace_id,_u,'publish'),
    'can_run', public.has_workflow_permission(_workspace_id,_u,'run')
  );
END $$;

REVOKE ALL ON FUNCTION public.get_my_workflow_permissions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_workflow_permissions(uuid) TO authenticated, service_role;