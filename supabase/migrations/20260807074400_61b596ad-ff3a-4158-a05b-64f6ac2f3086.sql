CREATE OR REPLACE FUNCTION public.explain_my_workflow_permissions(_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _u uuid := auth.uid();
  _w public.workspaces;
  _role public.tenant_role;
  _is_member boolean;
  _actions text[] := ARRAY['edit','publish','run'];
  _a text;
  _v boolean;
  _allowed boolean;
  _source text;
  _detail text;
  _items jsonb := '[]'::jsonb;
BEGIN
  IF _u IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _w FROM public.workspaces WHERE id = _workspace_id;
  IF _w.id IS NULL THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND' USING ERRCODE='42704'; END IF;

  _is_member := EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=_workspace_id AND m.user_id=_u);
  IF _w.owner_id <> _u AND NOT _is_member THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT tm.role INTO _role FROM public.tenant_members tm
   WHERE tm.tenant_id=_w.tenant_id AND tm.user_id=_u AND tm.status='active';

  FOREACH _a IN ARRAY _actions LOOP
    _v := NULL; _source := NULL; _detail := NULL;
    IF _w.owner_id = _u THEN
      _allowed := true; _source := 'owner'; _detail := NULL;
    ELSE
      SELECT CASE _a WHEN 'edit' THEN p.can_edit WHEN 'publish' THEN p.can_publish ELSE p.can_run END
        INTO _v FROM public.workflow_permissions p
       WHERE p.workspace_id=_workspace_id AND p.user_id=_u;
      IF _v IS NOT NULL THEN
        _allowed := _v; _source := 'user';
      ELSE
        IF _role IS NOT NULL THEN
          SELECT CASE _a WHEN 'edit' THEN rp.can_edit WHEN 'publish' THEN rp.can_publish ELSE rp.can_run END
            INTO _v FROM public.workflow_role_permissions rp
           WHERE rp.workspace_id=_workspace_id AND rp.role=_role;
        END IF;
        IF _v IS NOT NULL THEN
          _allowed := _v; _source := 'role'; _detail := _role::text;
        ELSE
          _allowed := (_a = 'run'); _source := 'default';
        END IF;
      END IF;
    END IF;
    _items := _items || jsonb_build_object('action', _a, 'allowed', _allowed, 'source', _source, 'detail', _detail);
  END LOOP;

  RETURN jsonb_build_object(
    'workspace_id', _workspace_id,
    'workspace_name', _w.name,
    'is_owner', _w.owner_id = _u,
    'tenant_role', _role,
    'can_manage', public.can_manage_workflow_permissions(_workspace_id),
    'permissions', _items
  );
END $function$;

REVOKE ALL ON FUNCTION public.explain_my_workflow_permissions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.explain_my_workflow_permissions(uuid) TO authenticated;