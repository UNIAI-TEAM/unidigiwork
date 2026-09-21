-- Đọc danh sách công việc đang chạy của tổ chức cho trang quản lý công việc.
-- Chỉ trả về việc thuộc workspace mà người gọi là thành viên.
CREATE OR REPLACE FUNCTION public.list_tenant_open_tasks(
  _tenant_id uuid,
  _include_done boolean DEFAULT false,
  _limit int DEFAULT 300)
RETURNS TABLE (
  id uuid,
  title text,
  status public.task_status,
  priority public.task_priority,
  workspace_id uuid,
  due_at timestamptz,
  updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _actor uuid := auth.uid();
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT public.is_tenant_member(_tenant_id) THEN
    RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT t.id, t.title, t.status, t.priority, t.workspace_id, t.due_at, t.updated_at
  FROM public.tasks t
  JOIN public.workspace_members m
    ON m.workspace_id = t.workspace_id AND m.user_id = _actor
  WHERE t.tenant_id = _tenant_id
    AND t.deleted_at IS NULL
    AND (
      t.status IN ('todo'::public.task_status, 'in_progress'::public.task_status, 'blocked'::public.task_status)
      OR (_include_done AND t.status = 'done'::public.task_status)
    )
  ORDER BY t.updated_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 300), 1), 500);
END $$;

REVOKE ALL ON FUNCTION public.list_tenant_open_tasks(uuid, boolean, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_tenant_open_tasks(uuid, boolean, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_tenant_open_tasks(uuid, boolean, int) TO service_role;
