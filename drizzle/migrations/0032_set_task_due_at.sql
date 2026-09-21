CREATE OR REPLACE FUNCTION public.set_task_due_at(
  _task_id uuid,
  _due_at timestamptz DEFAULT NULL,
  _idempotency_key text DEFAULT NULL,
  _correlation_id text DEFAULT NULL
) RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _task public.tasks;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _task FROM public.tasks WHERE id = _task_id AND deleted_at IS NULL;
  IF _task.id IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_task.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

  UPDATE public.tasks SET due_at = _due_at, updated_by = _actor
   WHERE id = _task_id RETURNING * INTO _task;

  -- Hạn thay đổi → dọn nhắc hạn cũ để chu kỳ sau cảnh báo lại theo hạn mới.
  DELETE FROM public.task_due_reminders WHERE task_id = _task_id;

  UPDATE public.work_nodes
     SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('due_at', _due_at)
                    - CASE WHEN _due_at IS NULL THEN 'due_state' ELSE '' END,
         updated_at = now()
   WHERE entity_type = 'TASK' AND entity_id = _task_id AND tenant_id = _task.tenant_id;

  PERFORM public._emit_outbox_event(_task.tenant_id, 'task.task.updated', 'task', _task.id::text,
    jsonb_build_object('task_id', _task.id, 'actor_id', _actor, 'due_at', _due_at,
                       'row_version', _task.row_version),
    _idempotency_key, _correlation_id);
  RETURN _task;
END $$;

REVOKE ALL ON FUNCTION public.set_task_due_at(uuid, timestamptz, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_task_due_at(uuid, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_task_due_at(uuid, timestamptz, text, text) TO service_role;