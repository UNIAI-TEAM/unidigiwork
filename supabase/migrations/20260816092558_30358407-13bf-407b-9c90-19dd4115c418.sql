CREATE OR REPLACE FUNCTION public.get_task_snapshot(_task_id uuid)
RETURNS TABLE (id uuid, title text, row_version integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT t.id, t.title, t.row_version
  FROM public.tasks t
  WHERE t.id = _task_id AND t.deleted_at IS NULL
$$;

REVOKE ALL ON FUNCTION public.get_task_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_task_snapshot(uuid) TO authenticated, service_role;