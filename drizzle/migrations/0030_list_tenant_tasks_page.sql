CREATE OR REPLACE FUNCTION public.list_tenant_tasks_page(
  _tenant_id uuid,
  _statuses text[] DEFAULT NULL,
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
  due_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT t.id, t.title, t.status::text AS status, t.priority::text AS priority,
           t.workspace_id, t.due_at, t.updated_at
    FROM public.tasks t
    JOIN public.workspace_members wm
      ON wm.workspace_id = t.workspace_id AND wm.user_id = auth.uid()
    WHERE t.tenant_id = _tenant_id
      AND auth.uid() IS NOT NULL
      AND public.is_tenant_member(_tenant_id)
      AND t.deleted_at IS NULL
      AND (_statuses IS NULL OR array_length(_statuses, 1) IS NULL OR t.status::text = ANY (_statuses))
      AND (
        _search IS NULL OR btrim(_search) = ''
        OR t.title ILIKE '%' || btrim(_search) || '%'
      )
  )
  SELECT s.id, s.title, s.status, s.priority, s.workspace_id, s.due_at, s.updated_at,
         count(*) OVER () AS total_count
  FROM scoped s
  ORDER BY s.updated_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(_limit, 25), 1), 100)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.list_tenant_tasks_page(uuid, text[], text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_tenant_tasks_page(uuid, text[], text, integer, integer) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS tasks_tenant_updated_idx ON public.tasks (tenant_id, updated_at DESC);