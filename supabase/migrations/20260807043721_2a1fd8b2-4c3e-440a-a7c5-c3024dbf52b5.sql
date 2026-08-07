
-- 1. update_workflow
CREATE OR REPLACE FUNCTION public.update_workflow(
  _workflow_id uuid,
  _name text DEFAULT NULL,
  _description text DEFAULT NULL,
  _definition jsonb DEFAULT NULL,
  _expected_row_version bigint DEFAULT NULL,
  _idempotency_key text DEFAULT NULL,
  _correlation_id text DEFAULT NULL
) RETURNS public.workflows
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _wf public.workflows;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _wf FROM public.workflows WHERE id = _workflow_id AND deleted_at IS NULL;
  IF _wf.id IS NULL THEN RAISE EXCEPTION 'WORKFLOW_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_wf.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF _expected_row_version IS NOT NULL AND _wf.row_version <> _expected_row_version THEN
    RAISE EXCEPTION 'WORKFLOW_VERSION_CONFLICT' USING ERRCODE='40001';
  END IF;
  IF _definition IS NOT NULL AND jsonb_typeof(_definition) <> 'object' THEN
    RAISE EXCEPTION 'WORKFLOW_DEFINITION_INVALID' USING ERRCODE='22023';
  END IF;
  UPDATE public.workflows SET
    name = COALESCE(_name, name),
    description = COALESCE(_description, description),
    definition = COALESCE(_definition, definition),
    status = CASE WHEN _definition IS NOT NULL AND status = 'published' THEN 'draft'::public.workflow_status ELSE status END,
    updated_by = _actor
  WHERE id = _workflow_id RETURNING * INTO _wf;
  PERFORM public._emit_outbox_event(_wf.tenant_id, 'workflow.workflow.updated', 'workflow', _wf.id::text,
    jsonb_build_object('workflow_id', _wf.id, 'actor_id', _actor), _idempotency_key, _correlation_id);
  RETURN _wf;
END $$;
REVOKE ALL ON FUNCTION public.update_workflow(uuid, text, text, jsonb, bigint, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.update_workflow(uuid, text, text, jsonb, bigint, text, text) TO authenticated;

-- 2. Triggers table
CREATE TABLE public.workflow_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  kind text NOT NULL CHECK (kind IN ('schedule','event')),
  frequency text CHECK (frequency IN ('minutes','hourly','daily','weekly')),
  interval_minutes integer CHECK (interval_minutes BETWEEN 1 AND 1440),
  at_hour integer CHECK (at_hour BETWEEN 0 AND 23),
  at_minute integer CHECK (at_minute BETWEEN 0 AND 59),
  weekday integer CHECK (weekday BETWEEN 0 AND 6),
  timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  event_type text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_enabled boolean NOT NULL DEFAULT true,
  next_run_at timestamptz,
  last_fired_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX workflow_triggers_workflow_idx ON public.workflow_triggers(workflow_id);
CREATE INDEX workflow_triggers_due_idx ON public.workflow_triggers(next_run_at) WHERE is_enabled AND kind = 'schedule';
CREATE INDEX workflow_triggers_event_idx ON public.workflow_triggers(workspace_id, event_type) WHERE kind = 'event';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_triggers TO authenticated;
GRANT ALL ON public.workflow_triggers TO service_role;
ALTER TABLE public.workflow_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY workflow_triggers_tenant_select ON public.workflow_triggers FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY workflow_triggers_tenant_write ON public.workflow_triggers FOR ALL TO authenticated USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));
CREATE TRIGGER workflow_triggers_set_updated_at BEFORE UPDATE ON public.workflow_triggers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Next run calculator
CREATE OR REPLACE FUNCTION public._workflow_next_run(
  _frequency text, _interval_minutes integer, _at_hour integer, _at_minute integer,
  _weekday integer, _timezone text, _from timestamptz
) RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE _tz text := COALESCE(_timezone, 'UTC'); _local timestamp; _cand timestamp; _i int := 0;
BEGIN
  IF _frequency = 'minutes' THEN
    RETURN _from + make_interval(mins => GREATEST(COALESCE(_interval_minutes, 15), 1));
  END IF;
  _local := _from AT TIME ZONE _tz;
  IF _frequency = 'hourly' THEN
    _cand := date_trunc('hour', _local) + make_interval(mins => COALESCE(_at_minute, 0));
    IF _cand <= _local THEN _cand := _cand + interval '1 hour'; END IF;
    RETURN _cand AT TIME ZONE _tz;
  END IF;
  _cand := date_trunc('day', _local) + make_interval(hours => COALESCE(_at_hour, 9), mins => COALESCE(_at_minute, 0));
  IF _frequency = 'daily' THEN
    IF _cand <= _local THEN _cand := _cand + interval '1 day'; END IF;
    RETURN _cand AT TIME ZONE _tz;
  END IF;
  -- weekly
  WHILE _i < 8 LOOP
    IF _cand > _local AND EXTRACT(dow FROM _cand)::int = COALESCE(_weekday, 1) THEN
      RETURN _cand AT TIME ZONE _tz;
    END IF;
    _cand := _cand + interval '1 day';
    _i := _i + 1;
  END LOOP;
  RETURN _from + interval '7 days';
END $$;

-- 4. Upsert / delete trigger
CREATE OR REPLACE FUNCTION public.upsert_workflow_trigger(
  _workflow_id uuid,
  _kind text,
  _trigger_id uuid DEFAULT NULL,
  _frequency text DEFAULT NULL,
  _interval_minutes integer DEFAULT NULL,
  _at_hour integer DEFAULT NULL,
  _at_minute integer DEFAULT NULL,
  _weekday integer DEFAULT NULL,
  _timezone text DEFAULT NULL,
  _event_type text DEFAULT NULL,
  _payload jsonb DEFAULT '{}'::jsonb,
  _is_enabled boolean DEFAULT true
) RETURNS public.workflow_triggers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _wf public.workflows; _tz text; _row public.workflow_triggers; _next timestamptz;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _wf FROM public.workflows WHERE id = _workflow_id AND deleted_at IS NULL;
  IF _wf.id IS NULL THEN RAISE EXCEPTION 'WORKFLOW_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_wf.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF _kind NOT IN ('schedule','event') THEN RAISE EXCEPTION 'WORKFLOW_TRIGGER_INVALID' USING ERRCODE='22023'; END IF;
  IF _kind = 'event' AND COALESCE(_event_type,'') = '' THEN RAISE EXCEPTION 'WORKFLOW_TRIGGER_INVALID' USING ERRCODE='22023'; END IF;
  IF _kind = 'schedule' AND COALESCE(_frequency,'') NOT IN ('minutes','hourly','daily','weekly') THEN
    RAISE EXCEPTION 'WORKFLOW_TRIGGER_INVALID' USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(_timezone, w.timezone, 'Asia/Ho_Chi_Minh') INTO _tz
  FROM public.workspaces w WHERE w.id = _wf.workspace_id;

  IF _kind = 'schedule' THEN
    _next := public._workflow_next_run(_frequency, _interval_minutes, _at_hour, _at_minute, _weekday, _tz, now());
  END IF;

  IF _trigger_id IS NULL THEN
    INSERT INTO public.workflow_triggers(
      workflow_id, tenant_id, workspace_id, kind, frequency, interval_minutes,
      at_hour, at_minute, weekday, timezone, event_type, payload, is_enabled, next_run_at, created_by)
    VALUES (_workflow_id, _wf.tenant_id, _wf.workspace_id, _kind, _frequency, _interval_minutes,
      _at_hour, _at_minute, _weekday, _tz, _event_type, COALESCE(_payload,'{}'::jsonb), COALESCE(_is_enabled,true), _next, _actor)
    RETURNING * INTO _row;
  ELSE
    UPDATE public.workflow_triggers SET
      kind = _kind, frequency = _frequency, interval_minutes = _interval_minutes,
      at_hour = _at_hour, at_minute = _at_minute, weekday = _weekday, timezone = _tz,
      event_type = _event_type, payload = COALESCE(_payload,'{}'::jsonb),
      is_enabled = COALESCE(_is_enabled, true), next_run_at = _next
    WHERE id = _trigger_id AND workflow_id = _workflow_id
    RETURNING * INTO _row;
    IF _row.id IS NULL THEN RAISE EXCEPTION 'WORKFLOW_TRIGGER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  END IF;
  RETURN _row;
END $$;
REVOKE ALL ON FUNCTION public.upsert_workflow_trigger(uuid, text, uuid, text, integer, integer, integer, integer, text, text, jsonb, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.upsert_workflow_trigger(uuid, text, uuid, text, integer, integer, integer, integer, text, text, jsonb, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_workflow_trigger(_trigger_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.workflow_triggers;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _t FROM public.workflow_triggers WHERE id = _trigger_id;
  IF _t.id IS NULL THEN RETURN false; END IF;
  IF NOT public.is_tenant_member(_t.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  DELETE FROM public.workflow_triggers WHERE id = _trigger_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.delete_workflow_trigger(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_workflow_trigger(uuid) TO authenticated;

-- 5. Internal run starter (no auth context) + schedule dispatcher
CREATE OR REPLACE FUNCTION public._start_workflow_run_internal(
  _workflow_id uuid, _context jsonb, _trigger_id uuid, _correlation_id text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _wf public.workflows; _run public.workflow_runs;
BEGIN
  SELECT * INTO _wf FROM public.workflows WHERE id = _workflow_id AND deleted_at IS NULL;
  IF _wf.id IS NULL OR _wf.status <> 'published' THEN RETURN NULL; END IF;
  IF NOT public.check_quota(_wf.tenant_id, 'workflows.runs_per_month', 1) THEN RETURN NULL; END IF;
  INSERT INTO public.workflow_runs(workflow_id, workflow_version, status, context, started_at, correlation_id)
  VALUES (_workflow_id, _wf.version, 'running',
    COALESCE(_context,'{}'::jsonb) || jsonb_build_object('trigger_id', _trigger_id), now(), _correlation_id)
  RETURNING * INTO _run;
  PERFORM public.record_usage(_wf.tenant_id, 'workflows.runs_per_month', 1, _run.id::text, _correlation_id, _wf.workspace_id, '{}'::jsonb);
  PERFORM public._emit_outbox_event(_wf.tenant_id, 'workflow.run.started', 'workflow_run', _run.id::text,
    jsonb_build_object('run_id', _run.id, 'workflow_id', _wf.id, 'trigger_id', _trigger_id, 'source', 'trigger'),
    _run.id::text, _correlation_id);
  RETURN _run.id;
END $$;
REVOKE ALL ON FUNCTION public._start_workflow_run_internal(uuid, jsonb, uuid, text) FROM public;

CREATE OR REPLACE FUNCTION public.dispatch_workflow_schedules()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.workflow_triggers; _count integer := 0; _run uuid;
BEGIN
  FOR _t IN
    SELECT * FROM public.workflow_triggers
    WHERE kind = 'schedule' AND is_enabled AND next_run_at IS NOT NULL AND next_run_at <= now()
    ORDER BY next_run_at LIMIT 200
  LOOP
    _run := public._start_workflow_run_internal(
      _t.workflow_id,
      _t.payload || jsonb_build_object('source', 'schedule'),
      _t.id,
      'sched-' || _t.id::text || '-' || to_char(now(), 'YYYYMMDDHH24MI')
    );
    UPDATE public.workflow_triggers
    SET last_fired_at = CASE WHEN _run IS NULL THEN last_fired_at ELSE now() END,
        next_run_at = public._workflow_next_run(frequency, interval_minutes, at_hour, at_minute, weekday, timezone, now())
    WHERE id = _t.id;
    IF _run IS NOT NULL THEN _count := _count + 1; END IF;
  END LOOP;
  RETURN _count;
END $$;
REVOKE ALL ON FUNCTION public.dispatch_workflow_schedules() FROM public;

-- 6. Event trigger firing (callable by signed-in members)
CREATE OR REPLACE FUNCTION public.fire_workflow_event(
  _workspace_id uuid, _event_type text, _payload jsonb DEFAULT '{}'::jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t public.workflow_triggers; _count integer := 0; _run uuid; _tenant uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  _tenant := public._resolve_workspace_tenant(_workspace_id);
  IF NOT public.is_tenant_member(_tenant) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  FOR _t IN
    SELECT * FROM public.workflow_triggers
    WHERE kind = 'event' AND is_enabled AND workspace_id = _workspace_id AND event_type = _event_type
  LOOP
    _run := public._start_workflow_run_internal(
      _t.workflow_id,
      _t.payload || COALESCE(_payload,'{}'::jsonb) || jsonb_build_object('source', 'event', 'event_type', _event_type),
      _t.id, 'evt-' || _t.id::text || '-' || gen_random_uuid()::text);
    IF _run IS NOT NULL THEN
      UPDATE public.workflow_triggers SET last_fired_at = now() WHERE id = _t.id;
      _count := _count + 1;
    END IF;
  END LOOP;
  RETURN _count;
END $$;
REVOKE ALL ON FUNCTION public.fire_workflow_event(uuid, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.fire_workflow_event(uuid, text, jsonb) TO authenticated;

SELECT cron.schedule('workflow-schedule-dispatcher', '* * * * *', $$SELECT public.dispatch_workflow_schedules();$$);
