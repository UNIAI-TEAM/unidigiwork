CREATE OR REPLACE FUNCTION public.list_task_message_recipients(_task_id uuid)
RETURNS TABLE (id uuid, display_name text, primary_email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.display_name, u.primary_email
  FROM public.tasks t
  JOIN public.task_assignees ta
    ON ta.task_id = t.id
   AND ta.tenant_id = t.tenant_id
  JOIN public.users u ON u.id = ta.user_id
  JOIN public.tenant_members tm
    ON tm.tenant_id = t.tenant_id
   AND tm.user_id = ta.user_id
   AND tm.status = 'active'
  WHERE t.id = _task_id
    AND t.deleted_at IS NULL
    AND auth.uid() IS NOT NULL
    AND public.is_tenant_member(t.tenant_id)
  ORDER BY COALESCE(NULLIF(u.display_name, ''), u.primary_email, u.id::text)
$$;

REVOKE ALL ON FUNCTION public.list_task_message_recipients(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_task_message_recipients(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.list_task_message_recipients(uuid) IS
  'Returns active tenant members currently assigned to a task visible to the caller.';