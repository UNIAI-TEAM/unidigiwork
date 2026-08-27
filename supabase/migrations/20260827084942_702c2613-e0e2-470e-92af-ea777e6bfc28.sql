CREATE OR REPLACE FUNCTION public.accept_ai_task_execution(_execution_id uuid, _complete_task boolean DEFAULT true, _idempotency_key text DEFAULT NULL, _correlation_id text DEFAULT NULL)
RETURNS public.ai_task_executions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _actor uuid := auth.uid(); _exec public.ai_task_executions; _task public.tasks; _allowed boolean;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _exec FROM public.ai_task_executions WHERE id=_execution_id;
  IF _exec.id IS NULL THEN RAISE EXCEPTION 'AI_EXECUTION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_exec.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _task FROM public.tasks WHERE id=_exec.task_id AND deleted_at IS NULL;
  IF _task.id IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF _exec.status = 'ACCEPTED' THEN RETURN _exec; END IF;
  IF _exec.status <> 'WAITING_REVIEW' THEN RAISE EXCEPTION 'AI_EXECUTION_NOT_REVIEWABLE' USING ERRCODE='22023'; END IF;

  _allowed := (_task.human_owner_id = _actor) OR (_task.created_by = _actor)
    OR EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=_task.workspace_id
               AND m.user_id=_actor AND m.role IN ('owner','admin'));
  IF NOT _allowed THEN RAISE EXCEPTION 'AI_REVIEW_FORBIDDEN' USING ERRCODE='42501'; END IF;

  UPDATE public.ai_task_executions SET status='ACCEPTED', reviewed_by=_actor, reviewed_at=now(),
    row_version=row_version+1, updated_at=now()
  WHERE id=_execution_id RETURNING * INTO _exec;

  UPDATE public.tasks SET ai_execution_status='ACCEPTED', updated_by=_actor WHERE id=_task.id;

  IF _complete_task AND _task.status NOT IN ('done','canceled') THEN
    IF _task.status IN ('todo','blocked') THEN
      PERFORM public.transition_task(_task.id, 'in_progress'::task_status, NULL,
        COALESCE(_idempotency_key, _execution_id::text) || ':accept-progress', _correlation_id);
    END IF;
    PERFORM public.transition_task(_task.id, 'done'::task_status, NULL,
      COALESCE(_idempotency_key, _execution_id::text) || ':accept', _correlation_id);
  END IF;

  PERFORM public._emit_outbox_event(_exec.tenant_id, 'task.ai.execution_accepted', 'ai_task_execution', _exec.id::text,
    jsonb_build_object('task_id',_task.id,'execution_id',_exec.id,'reviewer_id',_actor),
    COALESCE(_idempotency_key, _execution_id::text || ':accepted'), _correlation_id);
  RETURN _exec;
END $$;