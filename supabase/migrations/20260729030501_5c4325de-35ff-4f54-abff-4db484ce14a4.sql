-- Enriched QUOTA_EXCEEDED error with structured DETAIL payload.
CREATE OR REPLACE FUNCTION public._raise_quota_exceeded(
  _tenant_id uuid, _meter_key text, _delta bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _enabled boolean;
  _limit bigint;
  _current bigint;
  _remaining bigint;
  _detail text;
BEGIN
  SELECT enabled, quota_limit INTO _enabled, _limit
    FROM public.entitlements
   WHERE tenant_id = _tenant_id AND feature_key = _meter_key;

  SELECT COALESCE(SUM(total),0) INTO _current
    FROM public.usage_counters
   WHERE tenant_id = _tenant_id AND meter_key = _meter_key
     AND period_start = date_trunc('month', now());

  IF _limit IS NULL THEN
    _remaining := NULL;
  ELSE
    _remaining := GREATEST(_limit - COALESCE(_current, 0), 0);
  END IF;

  _detail := jsonb_build_object(
    'code',              'QUOTA_EXCEEDED',
    'tenant_id',         _tenant_id,
    'meter',             _meter_key,
    'enabled',           COALESCE(_enabled, false),
    'quota_limit',       _limit,
    'current_usage',     COALESCE(_current, 0),
    'attempted_delta',   _delta,
    'current_remaining', _remaining
  )::text;

  RAISE EXCEPTION 'QUOTA_EXCEEDED: %', _meter_key
    USING ERRCODE = '53400', DETAIL = _detail;
END $$;

REVOKE ALL ON FUNCTION public._raise_quota_exceeded(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._raise_quota_exceeded(uuid, text, bigint) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Rewire the 4 business RPCs to use the enriched raiser.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_task(
  _workspace_id uuid, _title text, _description text DEFAULT NULL,
  _priority task_priority DEFAULT 'normal', _due_at timestamptz DEFAULT NULL,
  _assignee_id uuid DEFAULT NULL, _idempotency_key text DEFAULT NULL,
  _correlation_id text DEFAULT NULL
) RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _tenant uuid; _task public.tasks;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  _tenant := public._resolve_workspace_tenant(_workspace_id);
  IF NOT public.check_quota(_tenant, 'tasks.active', 1) THEN
    PERFORM public._raise_quota_exceeded(_tenant, 'tasks.active', 1);
  END IF;
  INSERT INTO public.tasks(workspace_id, title, description, priority, due_at, created_by, updated_by)
  VALUES (_workspace_id, _title, _description, COALESCE(_priority,'normal'), _due_at, _actor, _actor)
  RETURNING * INTO _task;
  IF _assignee_id IS NOT NULL THEN
    INSERT INTO public.task_assignees(task_id, user_id, role, assigned_by)
    VALUES (_task.id, _assignee_id, 'assignee', _actor);
  END IF;
  PERFORM public.record_usage(_tenant, 'tasks.active', 1, _idempotency_key, _correlation_id, _workspace_id, '{}'::jsonb);
  PERFORM public._emit_outbox_event(_tenant, 'task.task.created', 'task', _task.id::text,
    jsonb_build_object('task_id', _task.id, 'workspace_id', _workspace_id, 'title', _title,
      'priority', _task.priority, 'assignee_id', _assignee_id, 'created_by', _actor),
    _idempotency_key, _correlation_id);
  RETURN _task;
END $$;

-- upload_document_version: patch RAISE only
DO $mig$
DECLARE _src text; _new text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO _src FROM pg_proc WHERE proname='upload_document_version';
  _new := replace(_src,
    E'RAISE EXCEPTION ''QUOTA_EXCEEDED: documents.storage_bytes'' USING ERRCODE=''53400'';',
    E'PERFORM public._raise_quota_exceeded(_doc.tenant_id, ''documents.storage_bytes'', _delta);');
  EXECUTE _new;
END $mig$;

DO $mig$
DECLARE _src text; _new text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO _src FROM pg_proc WHERE proname='schedule_meeting';
  _new := replace(_src,
    E'RAISE EXCEPTION ''QUOTA_EXCEEDED: meetings.scheduled_per_month'' USING ERRCODE=''53400'';',
    E'PERFORM public._raise_quota_exceeded(_tenant, ''meetings.scheduled_per_month'', 1);');
  EXECUTE _new;
END $mig$;

DO $mig$
DECLARE _src text; _new text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO _src FROM pg_proc WHERE proname='start_workflow_run';
  _new := replace(_src,
    E'RAISE EXCEPTION ''QUOTA_EXCEEDED: workflows.runs_per_month'' USING ERRCODE=''53400'';',
    E'PERFORM public._raise_quota_exceeded(_tenant, ''workflows.runs_per_month'', 1);');
  EXECUTE _new;
END $mig$;