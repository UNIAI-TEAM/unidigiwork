CREATE OR REPLACE FUNCTION public.list_task_following_page_v2(
  _tenant_id uuid,
  _following boolean DEFAULT NULL,
  _statuses text[] DEFAULT ARRAY[]::text[],
  _search text DEFAULT NULL,
  _limit integer DEFAULT 25,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  title text,
  status text,
  priority text,
  workspace_id uuid,
  workspace_name text,
  due_at timestamptz,
  updated_at timestamptz,
  following boolean,
  follower_count bigint,
  assignee_id uuid,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_tenant_member(_tenant_id) THEN
    RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH visible_tasks AS (
    SELECT
      t.id,
      t.title,
      t.status::text AS status,
      t.priority::text AS priority,
      t.workspace_id,
      w.name AS workspace_name,
      t.due_at,
      t.updated_at,
      EXISTS (
        SELECT 1 FROM public.task_followers mine
        WHERE mine.task_id = t.id AND mine.user_id = auth.uid()
      ) AS following,
      (SELECT count(*) FROM public.task_followers followers WHERE followers.task_id = t.id) AS follower_count,
      (SELECT ta.user_id FROM public.task_assignees ta WHERE ta.task_id = t.id ORDER BY ta.assigned_at, ta.user_id LIMIT 1) AS assignee_id
    FROM public.tasks t
    JOIN public.workspaces w ON w.id = t.workspace_id
    WHERE t.tenant_id = _tenant_id
      AND t.deleted_at IS NULL
      AND public.can_view_work_entity('TASK', t.id)
      AND (coalesce(array_length(_statuses, 1), 0) = 0 OR t.status::text = ANY(_statuses))
      AND (nullif(btrim(coalesce(_search, '')), '') IS NULL OR t.title ILIKE '%' || btrim(_search) || '%')
  ), filtered AS (
    SELECT * FROM visible_tasks v WHERE _following IS NULL OR v.following = _following
  )
  SELECT f.id, f.title, f.status, f.priority, f.workspace_id, f.workspace_name,
         f.due_at, f.updated_at, f.following, f.follower_count, f.assignee_id,
         count(*) OVER() AS total_count
  FROM filtered f
  ORDER BY f.following DESC, f.updated_at DESC NULLS LAST, f.id
  LIMIT greatest(1, least(coalesce(_limit, 25), 100))
  OFFSET greatest(coalesce(_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.list_task_following_page_v2(uuid, boolean, text[], text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_task_following_page_v2(uuid, boolean, text[], text, integer, integer) TO authenticated, service_role;