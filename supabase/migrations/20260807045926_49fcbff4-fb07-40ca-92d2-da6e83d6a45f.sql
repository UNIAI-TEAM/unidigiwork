CREATE OR REPLACE FUNCTION public.advance_workflow_step(
  _run_id uuid, _step_key text, _to_status workflow_step_status,
  _input jsonb DEFAULT '{}'::jsonb, _output jsonb DEFAULT NULL, _error text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL, _correlation_id text DEFAULT NULL
) RETURNS public.workflow_steps LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor uuid := auth.uid();
  _run public.workflow_runs;
  _step public.workflow_steps;
  _wf public.workflows;
  _policy text := 'stop';
  _eff_status workflow_step_status := _to_status;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _run FROM public.workflow_runs WHERE id = _run_id;
  IF _run.id IS NULL THEN RAISE EXCEPTION 'WORKFLOW_RUN_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_run.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

  IF _to_status = 'failed' THEN
    SELECT * INTO _wf FROM public.workflows WHERE id = _run.workflow_id;
    SELECT COALESCE(s->'config'->>'on_error', 'stop') INTO _policy
    FROM jsonb_array_elements(COALESCE(_wf.definition->'steps', '[]'::jsonb)) AS s
    WHERE s->>'key' = _step_key
    LIMIT 1;
    _policy := COALESCE(_policy, 'stop');
    IF _policy = 'skip' THEN _eff_status := 'skipped'; END IF;
  END IF;

  SELECT * INTO _step FROM public.workflow_steps WHERE run_id = _run_id AND step_key = _step_key;
  IF _step.id IS NULL THEN
    INSERT INTO public.workflow_steps(run_id, step_key, status, input,
      started_at, ended_at, output, error)
    VALUES (_run_id, _step_key, _eff_status, COALESCE(_input,'{}'::jsonb),
      CASE WHEN _eff_status IN ('running','succeeded','failed','skipped') THEN now() END,
      CASE WHEN _eff_status IN ('succeeded','failed','skipped') THEN now() END,
      _output, _error)
    RETURNING * INTO _step;
  ELSE
    UPDATE public.workflow_steps SET status = _eff_status,
      output = COALESCE(_output, output), error = COALESCE(_error, error),
      started_at = COALESCE(started_at, CASE WHEN _eff_status='running' THEN now() END),
      ended_at = CASE WHEN _eff_status IN ('succeeded','failed','skipped') THEN now() ELSE ended_at END
    WHERE id = _step.id RETURNING * INTO _step;
  END IF;

  IF _to_status = 'failed' AND _policy = 'stop' AND _run.status IN ('pending','running') THEN
    UPDATE public.workflow_runs SET status = 'failed', ended_at = now() WHERE id = _run_id;
    PERFORM public._emit_outbox_event(_run.tenant_id, 'workflow.run.failed', 'workflow_run', _run.id::text,
      jsonb_build_object('run_id', _run.id, 'step_key', _step_key, 'error', _error),
      NULL, _correlation_id);
  END IF;

  PERFORM public._emit_outbox_event(_run.tenant_id, 'workflow.step.advanced', 'workflow_step', _run.id::text,
    jsonb_build_object('run_id', _run.id, 'step_key', _step_key, 'to_status', _eff_status,
      'requested_status', _to_status, 'on_error', _policy),
    _idempotency_key, _correlation_id);
  RETURN _step;
END $$;

CREATE OR REPLACE FUNCTION public.retry_workflow_run(
  _run_id uuid,
  _mode text DEFAULT 'all',
  _idempotency_key text DEFAULT NULL,
  _correlation_id text DEFAULT NULL
) RETURNS public.workflow_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor uuid := auth.uid();
  _src public.workflow_runs;
  _wf public.workflows;
  _new public.workflow_runs;
  _failed_step text;
  _ctx jsonb;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF _mode NOT IN ('all','failed_step') THEN
    RAISE EXCEPTION 'WORKFLOW_RETRY_INVALID_MODE' USING ERRCODE='22023';
  END IF;
  SELECT * INTO _src FROM public.workflow_runs WHERE id = _run_id;
  IF _src.id IS NULL THEN RAISE EXCEPTION 'WORKFLOW_RUN_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_src.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF _src.status NOT IN ('failed','canceled') THEN
    RAISE EXCEPTION 'WORKFLOW_RUN_INVALID_TRANSITION' USING ERRCODE='22023';
  END IF;

  SELECT * INTO _wf FROM public.workflows WHERE id = _src.workflow_id AND deleted_at IS NULL;
  IF _wf.id IS NULL THEN RAISE EXCEPTION 'WORKFLOW_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.check_quota(_wf.tenant_id, 'workflows.runs_per_month', 1) THEN
    PERFORM public._raise_quota_exceeded('workflows.runs_per_month');
  END IF;

  SELECT step_key INTO _failed_step FROM public.workflow_steps
  WHERE run_id = _run_id AND status = 'failed'
  ORDER BY created_at DESC LIMIT 1;

  _ctx := COALESCE(_src.context, '{}'::jsonb) || jsonb_build_object(
    'retry_of_run_id', _src.id::text,
    'retry_mode', _mode,
    'resume_from_step', CASE WHEN _mode = 'failed_step' THEN to_jsonb(_failed_step) ELSE 'null'::jsonb END
  );

  INSERT INTO public.workflow_runs(workflow_id, workflow_version, status, context, started_at, correlation_id, triggered_by)
  VALUES (_wf.id, _wf.version, 'running', _ctx, now(), COALESCE(_correlation_id, _src.correlation_id), _actor)
  RETURNING * INTO _new;

  PERFORM public.record_usage(_wf.tenant_id, 'workflows.runs_per_month', 1, _new.id::text, _correlation_id, _wf.workspace_id, '{}'::jsonb);
  PERFORM public._emit_outbox_event(_wf.tenant_id, 'workflow.run.started', 'workflow_run', _new.id::text,
    jsonb_build_object('run_id', _new.id, 'workflow_id', _wf.id, 'source', 'retry',
      'retry_of_run_id', _src.id, 'retry_mode', _mode, 'actor_id', _actor),
    _idempotency_key, _correlation_id);
  RETURN _new;
END $$;

REVOKE ALL ON FUNCTION public.retry_workflow_run(uuid, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.retry_workflow_run(uuid, text, text, text) TO authenticated;