-- Fix: start_workflow_run should use _wf.tenant_id
CREATE OR REPLACE FUNCTION public.start_workflow_run(
  _workflow_id uuid, _context jsonb DEFAULT '{}'::jsonb,
  _idempotency_key text DEFAULT NULL, _correlation_id text DEFAULT NULL
) RETURNS public.workflow_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _wf public.workflows; _run public.workflow_runs;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _wf FROM public.workflows WHERE id = _workflow_id AND deleted_at IS NULL;
  IF _wf.id IS NULL THEN RAISE EXCEPTION 'WORKFLOW_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_wf.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF _wf.status <> 'published' THEN RAISE EXCEPTION 'WORKFLOW_NOT_PUBLISHED' USING ERRCODE='22023'; END IF;
  IF NOT public.check_quota(_wf.tenant_id, 'workflows.runs_per_month', 1) THEN
    PERFORM public._raise_quota_exceeded(_wf.tenant_id, 'workflows.runs_per_month', 1);
  END IF;
  INSERT INTO public.workflow_runs(workflow_id, workflow_version, status, context, started_at, correlation_id, triggered_by)
  VALUES (_workflow_id, _wf.version, 'running', COALESCE(_context,'{}'::jsonb), now(), _correlation_id, _actor)
  RETURNING * INTO _run;
  PERFORM public.record_usage(_wf.tenant_id, 'workflows.runs_per_month', 1, _idempotency_key, _correlation_id, _wf.workspace_id, '{}'::jsonb);
  PERFORM public._emit_outbox_event(_wf.tenant_id, 'workflow.run.started', 'workflow_run', _run.id::text,
    jsonb_build_object('run_id', _run.id, 'workflow_id', _wf.id, 'version', _wf.version, 'correlation_id', _correlation_id),
    _idempotency_key, _correlation_id);
  RETURN _run;
END $$;

-- Fix: schedule_meeting overload (start_at before agenda) — 11 args
CREATE OR REPLACE FUNCTION public.schedule_meeting(
  _workspace_id uuid, _title text,
  _start_at timestamptz, _end_at timestamptz,
  _agenda text DEFAULT NULL,
  _timezone text DEFAULT 'UTC',
  _rrule text DEFAULT NULL, _location text DEFAULT NULL,
  _participant_ids uuid[] DEFAULT NULL,
  _idempotency_key text DEFAULT NULL, _correlation_id text DEFAULT NULL
) RETURNS public.meetings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _tenant uuid; _m public.meetings; _p uuid;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  _tenant := public._resolve_workspace_tenant(_workspace_id);
  IF _end_at <= _start_at THEN RAISE EXCEPTION 'MEETING_TIME_INVALID' USING ERRCODE='22023'; END IF;
  IF NOT public.check_quota(_tenant, 'meetings.scheduled_per_month', 1) THEN
    PERFORM public._raise_quota_exceeded(_tenant, 'meetings.scheduled_per_month', 1);
  END IF;
  INSERT INTO public.meetings(workspace_id, title, agenda, start_at, end_at, timezone, rrule, location, created_by, updated_by)
  VALUES (_workspace_id, _title, _agenda, _start_at, _end_at, COALESCE(_timezone,'UTC'), _rrule, _location, _actor, _actor)
  RETURNING * INTO _m;
  INSERT INTO public.meeting_participants(meeting_id, user_id, role) VALUES (_m.id, _actor, 'host')
  ON CONFLICT DO NOTHING;
  IF _participant_ids IS NOT NULL THEN
    FOREACH _p IN ARRAY _participant_ids LOOP
      INSERT INTO public.meeting_participants(meeting_id, user_id, role) VALUES (_m.id, _p, 'participant')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  PERFORM public.record_usage(_tenant, 'meetings.scheduled_per_month', 1, _idempotency_key, _correlation_id, _workspace_id, '{}'::jsonb);
  PERFORM public._emit_outbox_event(_tenant, 'meeting.meeting.scheduled', 'meeting', _m.id::text,
    jsonb_build_object('meeting_id', _m.id, 'start_at', _m.start_at, 'end_at', _m.end_at, 'timezone', _m.timezone,
      'participants', COALESCE(_participant_ids, ARRAY[]::uuid[])),
    _idempotency_key, _correlation_id);
  RETURN _m;
END $$;