-- 1) Controlled command for tags (replaces direct UPDATE)
CREATE OR REPLACE FUNCTION public.set_task_tags(_task_id uuid, _tags text[])
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.tasks;
BEGIN
  SELECT * INTO t FROM public.tasks WHERE id = _task_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_tenant_member(t.tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  UPDATE public.tasks
     SET tags = COALESCE(_tags, '{}'::text[]),
         updated_at = now()
   WHERE id = _task_id
  RETURNING * INTO t;
  RETURN t;
END;
$$;

REVOKE ALL ON FUNCTION public.set_task_tags(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_task_tags(uuid, text[]) TO authenticated, service_role;

-- 2) Lock down direct writes via Data API
DROP POLICY IF EXISTS tasks_tenant_write ON public.tasks;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tasks FROM authenticated;
REVOKE ALL ON public.tasks FROM anon;
GRANT SELECT ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;