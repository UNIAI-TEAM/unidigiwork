CREATE OR REPLACE FUNCTION public.simulate_workflow_run(
  _workflow_id uuid,
  _payload jsonb DEFAULT '{}'::jsonb,
  _trigger_source text DEFAULT 'manual',
  _fail_step_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor uuid := auth.uid();
  _wf public.workflows;
  _steps jsonb;
  _s jsonb;
  _idx int := 0;
  _trace jsonb := '[]'::jsonb;
  _warnings jsonb := '[]'::jsonb;
  _policy text;
  _status text;
  _stopped boolean := false;
  _trigger_count int := 0;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF _trigger_source NOT IN ('manual','schedule','event') THEN
    RAISE EXCEPTION 'WORKFLOW_SIMULATION_INVALID_SOURCE' USING ERRCODE='22023';
  END IF;

  SELECT * INTO _wf FROM public.workflows WHERE id = _workflow_id AND deleted_at IS NULL;
  IF _wf.id IS NULL THEN RAISE EXCEPTION 'WORKFLOW_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_wf.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

  _steps := COALESCE(_wf.definition->'steps', '[]'::jsonb);
  IF jsonb_array_length(_steps) = 0 THEN
    _warnings := _warnings || to_jsonb('Quy trình chưa có bước nào.'::text);
  END IF;
  IF _wf.status <> 'published' THEN
    _warnings := _warnings || to_jsonb('Quy trình chưa phát hành — chạy thử không tạo lượt chạy thật.'::text);
  END IF;

  IF _trigger_source <> 'manual' THEN
    SELECT count(*) INTO _trigger_count FROM public.workflow_triggers
    WHERE workflow_id = _workflow_id AND is_enabled
      AND kind = CASE WHEN _trigger_source = 'schedule' THEN 'schedule' ELSE 'event' END;
    IF _trigger_count = 0 THEN
      _warnings := _warnings || to_jsonb(
        ('Chưa có trigger đang bật thuộc loại "' || _trigger_source || '".')::text);
    END IF;
  END IF;

  FOR _s IN SELECT * FROM jsonb_array_elements(_steps) LOOP
    _idx := _idx + 1;
    _policy := COALESCE(_s->'config'->>'on_error', 'stop');
    IF _stopped THEN
      _status := 'not_reached';
    ELSIF _fail_step_key IS NOT NULL AND _s->>'key' = _fail_step_key THEN
      IF _policy = 'skip' THEN
        _status := 'skipped';
      ELSE
        _status := 'failed';
        _stopped := true;
      END IF;
    ELSE
      _status := 'succeeded';
    END IF;

    _trace := _trace || jsonb_build_object(
      'order', _idx,
      'key', _s->>'key',
      'title', _s->>'title',
      'type', _s->>'type',
      'on_error', _policy,
      'status', _status,
      'input', jsonb_build_object(
        'payload', COALESCE(_payload, '{}'::jsonb),
        'trigger_source', _trigger_source,
        'step_config', COALESCE(_s->'config', '{}'::jsonb)
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'workflow_id', _wf.id,
    'workflow_name', _wf.name,
    'workflow_status', _wf.status,
    'trigger_source', _trigger_source,
    'simulated_at', now(),
    'run_status', CASE WHEN _stopped THEN 'failed' ELSE 'succeeded' END,
    'step_count', jsonb_array_length(_steps),
    'steps', _trace,
    'warnings', _warnings
  );
END $$;

REVOKE ALL ON FUNCTION public.simulate_workflow_run(uuid, jsonb, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.simulate_workflow_run(uuid, jsonb, text, text) TO authenticated;