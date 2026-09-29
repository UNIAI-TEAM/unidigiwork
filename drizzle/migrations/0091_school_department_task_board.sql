CREATE OR REPLACE FUNCTION public._school_can_manage_dept_tasks(_tenant_id uuid, _department text, _uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public._school_is_bgh(_tenant_id, _uid)
    OR EXISTS (
      SELECT 1
      FROM public.tenant_members m
      JOIN public.tenant_member_profiles p
        ON p.tenant_id = m.tenant_id AND p.user_id = m.user_id
      WHERE m.tenant_id = _tenant_id
        AND m.user_id = _uid
        AND m.status = 'active'
        AND m.role = 'manager'
        AND nullif(btrim(p.department), '') = nullif(btrim(_department), '')
    )
$$;

REVOKE ALL ON FUNCTION public._school_can_manage_dept_tasks(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._school_can_manage_dept_tasks(uuid, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.school_list_dept_tasks(
  _tenant_id uuid,
  _department text
)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  status public.task_status,
  priority public.task_priority,
  due_at timestamptz,
  row_version bigint,
  updated_at timestamptz,
  assignees jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant_id AND industry_pack = 'school') THEN
    RAISE EXCEPTION 'PACK_DISABLED' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(_department), '') IS NULL OR NOT public._school_can_manage_dept_tasks(_tenant_id, btrim(_department), auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT t.id, t.title, t.description, t.status, t.priority, t.due_at, t.row_version, t.updated_at,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', a.user_id,
        'display_name', COALESCE(pr.display_name, u.display_name, u.email),
        'email', COALESCE(pr.email, u.email)
      ) ORDER BY COALESCE(pr.display_name, u.display_name, u.email))
      FROM public.task_assignees a
      LEFT JOIN public.profiles pr ON pr.id = a.user_id
      LEFT JOIN public.users u ON u.id = a.user_id
      WHERE a.task_id = t.id AND a.role = 'assignee'
    ), '[]'::jsonb)
  FROM public.tasks t
  WHERE t.tenant_id = _tenant_id
    AND t.deleted_at IS NULL
    AND t.status <> 'canceled'
    AND public._school_task_in_dept(_tenant_id, t.id, t.human_owner_id, btrim(_department))
  ORDER BY t.updated_at DESC;
END
$$;

REVOKE ALL ON FUNCTION public.school_list_dept_tasks(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.school_list_dept_tasks(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.school_list_dept_task_members(
  _tenant_id uuid,
  _department text
)
RETURNS TABLE(user_id uuid, display_name text, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF NOT public._school_can_manage_dept_tasks(_tenant_id, btrim(_department), auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT m.user_id, COALESCE(pr.display_name, u.display_name, u.email)::text, COALESCE(pr.email, u.email)::text
  FROM public.tenant_members m
  JOIN public.tenant_member_profiles p ON p.tenant_id = m.tenant_id AND p.user_id = m.user_id
  LEFT JOIN public.profiles pr ON pr.id = m.user_id
  LEFT JOIN public.users u ON u.id = m.user_id
  WHERE m.tenant_id = _tenant_id
    AND m.status = 'active'
    AND nullif(btrim(p.department), '') = btrim(_department)
  ORDER BY COALESCE(pr.display_name, u.display_name, u.email);
END
$$;

REVOKE ALL ON FUNCTION public.school_list_dept_task_members(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.school_list_dept_task_members(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.school_create_dept_task(
  _tenant_id uuid,
  _department text,
  _title text,
  _description text DEFAULT NULL,
  _priority public.task_priority DEFAULT 'normal',
  _due_at timestamptz DEFAULT NULL,
  _assignee_id uuid DEFAULT NULL,
  _idempotency_key text DEFAULT NULL,
  _correlation_id text DEFAULT NULL
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _workspace_id uuid;
  _task public.tasks;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF NOT public._school_can_manage_dept_tasks(_tenant_id, btrim(_department), auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF _assignee_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.tenant_members m
    JOIN public.tenant_member_profiles p ON p.tenant_id = m.tenant_id AND p.user_id = m.user_id
    WHERE m.tenant_id = _tenant_id AND m.user_id = _assignee_id AND m.status = 'active'
      AND nullif(btrim(p.department), '') = btrim(_department)
  ) THEN
    RAISE EXCEPTION 'ASSIGNEE_OUTSIDE_DEPARTMENT' USING ERRCODE = '42501';
  END IF;

  SELECT w.id INTO _workspace_id
  FROM public.workspaces w
  WHERE w.tenant_id = _tenant_id
  ORDER BY w.created_at
  LIMIT 1;
  IF _workspace_id IS NULL THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO _task FROM public.create_task(
    _workspace_id, _title, _description, _priority, _due_at, _assignee_id,
    _idempotency_key, _correlation_id
  );
  RETURN _task;
END
$$;

REVOKE ALL ON FUNCTION public.school_create_dept_task(uuid, text, text, text, public.task_priority, timestamptz, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.school_create_dept_task(uuid, text, text, text, public.task_priority, timestamptz, uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.school_transition_dept_task(
  _tenant_id uuid,
  _department text,
  _task_id uuid,
  _to_status public.task_status,
  _expected_row_version bigint,
  _idempotency_key text DEFAULT NULL,
  _correlation_id text DEFAULT NULL
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task public.tasks;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF NOT public._school_can_manage_dept_tasks(_tenant_id, btrim(_department), auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _task FROM public.tasks WHERE id = _task_id AND tenant_id = _tenant_id AND deleted_at IS NULL;
  IF _task.id IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT public._school_task_in_dept(_tenant_id, _task.id, _task.human_owner_id, btrim(_department)) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _task FROM public.transition_task(
    _task_id, _to_status, _expected_row_version, _idempotency_key, _correlation_id
  );
  RETURN _task;
END
$$;

REVOKE ALL ON FUNCTION public.school_transition_dept_task(uuid, text, uuid, public.task_status, bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.school_transition_dept_task(uuid, text, uuid, public.task_status, bigint, text, text) TO authenticated, service_role;