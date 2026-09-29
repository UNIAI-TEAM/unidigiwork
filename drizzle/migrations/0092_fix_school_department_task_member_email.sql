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
        'display_name', COALESCE(pr.display_name, u.display_name, u.primary_email),
        'email', COALESCE(pr.email, u.primary_email)
      ) ORDER BY COALESCE(pr.display_name, u.display_name, u.primary_email))
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
  SELECT m.user_id, COALESCE(pr.display_name, u.display_name, u.primary_email)::text, COALESCE(pr.email, u.primary_email)::text
  FROM public.tenant_members m
  JOIN public.tenant_member_profiles p ON p.tenant_id = m.tenant_id AND p.user_id = m.user_id
  LEFT JOIN public.profiles pr ON pr.id = m.user_id
  LEFT JOIN public.users u ON u.id = m.user_id
  WHERE m.tenant_id = _tenant_id
    AND m.status = 'active'
    AND nullif(btrim(p.department), '') = btrim(_department)
  ORDER BY COALESCE(pr.display_name, u.display_name, u.primary_email);
END
$$;