CREATE OR REPLACE FUNCTION public.school_my_overdue_count(_tenant_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.tasks t
  WHERE t.tenant_id = _tenant_id
    AND EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id = _tenant_id AND m.user_id = auth.uid() AND m.status = 'active')
    AND t.status NOT IN ('done','canceled')
    AND t.due_at IS NOT NULL AND t.due_at < now()
    AND (t.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.task_assignees a WHERE a.task_id = t.id AND a.user_id = auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.school_my_overdue_count(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.school_my_overdue_count(uuid) TO authenticated;