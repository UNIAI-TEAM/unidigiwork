-- Gán lại người phụ trách chính của một công việc.
-- Xoá assignee cũ (role 'assignee') và gán người mới trong cùng transaction,
-- nhờ đó trigger work_graph tự gỡ/ tạo cạnh ASSIGNED_TO trong Work Graph.
CREATE OR REPLACE FUNCTION public.reassign_task(
  _task_id uuid,
  _assignee_id uuid,
  _idempotency_key text DEFAULT NULL,
  _correlation_id text DEFAULT NULL)
RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _actor uuid := auth.uid();
  _task public.tasks;
  _previous uuid[];
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;

  SELECT * INTO _task FROM public.tasks WHERE id = _task_id AND deleted_at IS NULL;
  IF _task.id IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_task.tenant_id) THEN
    RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  IF NOT public.is_workspace_member(_task.workspace_id, _actor) THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  IF NOT public.is_workspace_member(_task.workspace_id, _assignee_id) THEN
    RAISE EXCEPTION 'TASK_ASSIGNEE_INVALID' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(array_agg(user_id), '{}'::uuid[]) INTO _previous
  FROM public.task_assignees
  WHERE task_id = _task_id AND role = 'assignee' AND user_id <> _assignee_id;

  DELETE FROM public.task_assignees
  WHERE task_id = _task_id AND role = 'assignee' AND user_id <> _assignee_id;

  INSERT INTO public.task_assignees(task_id, user_id, role, assigned_by)
  VALUES (_task_id, _assignee_id, 'assignee', _actor)
  ON CONFLICT (task_id, user_id, role)
  DO UPDATE SET assigned_by = _actor, assigned_at = now();

  UPDATE public.tasks SET updated_by = _actor WHERE id = _task_id RETURNING * INTO _task;

  PERFORM public._emit_outbox_event(
    _task.tenant_id, 'task.task.reassigned', 'task', _task.id::text,
    jsonb_build_object(
      'task_id', _task.id,
      'assignee_id', _assignee_id,
      'previous_assignee_ids', to_jsonb(_previous),
      'actor_id', _actor,
      'title', _task.title,
      'notify_user_ids', to_jsonb(ARRAY[_assignee_id])),
    _idempotency_key, _correlation_id);

  RETURN _task;
END $$;

REVOKE ALL ON FUNCTION public.reassign_task(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reassign_task(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reassign_task(uuid, uuid, text, text) TO service_role;
