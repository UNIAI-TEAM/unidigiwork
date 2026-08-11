-- 1) record_usage: allow negative (decrement) quantities, clamp counters at zero
CREATE OR REPLACE FUNCTION public.record_usage(
  _tenant_id uuid, _meter_key text, _quantity bigint,
  _idempotency_key text DEFAULT NULL::text, _correlation_id text DEFAULT NULL::text,
  _workspace_id uuid DEFAULT NULL::uuid, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _actor uuid := auth.uid(); _period_start date; _event_id uuid;
BEGIN
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: tenant is required' USING ERRCODE = '22000';
  END IF;
  IF _meter_key IS NULL OR length(btrim(_meter_key)) = 0 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: meter_key is required' USING ERRCODE = '22000';
  END IF;
  IF _quantity IS NULL OR _quantity = 0 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: quantity must be non-zero' USING ERRCODE = '22000';
  END IF;

  _period_start := date_trunc('month', now())::date;

  INSERT INTO public.usage_events(tenant_id, meter_key, quantity, actor_id, workspace_id, correlation_id, idempotency_key, metadata)
  VALUES (_tenant_id, _meter_key, _quantity, _actor, _workspace_id, _correlation_id, _idempotency_key, COALESCE(_metadata,'{}'::jsonb))
  ON CONFLICT DO NOTHING
  RETURNING id INTO _event_id;

  INSERT INTO public.usage_counters(tenant_id, meter_key, period_start, period_end, quantity)
  VALUES (_tenant_id, _meter_key, _period_start, (_period_start + INTERVAL '1 month')::date, GREATEST(_quantity, 0))
  ON CONFLICT (tenant_id, meter_key, period_start)
  DO UPDATE SET quantity = GREATEST(public.usage_counters.quantity + EXCLUDED.quantity, 0);

  RETURN _event_id;
END $function$;

-- 2) assign_task: conflict target must match primary key (task_id, user_id, role)
CREATE OR REPLACE FUNCTION public.assign_task(
  _task_id uuid, _assignee_id uuid, _role text DEFAULT 'assignee'::text,
  _idempotency_key text DEFAULT NULL::text, _correlation_id text DEFAULT NULL::text)
RETURNS tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _actor uuid := auth.uid(); _task public.tasks;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _task FROM public.tasks WHERE id = _task_id AND deleted_at IS NULL;
  IF _task.id IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_task.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT public.is_workspace_member(_task.workspace_id, _assignee_id) THEN
    RAISE EXCEPTION 'TASK_ASSIGNEE_INVALID' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.task_assignees(task_id, user_id, role, assigned_by)
  VALUES (_task_id, _assignee_id, COALESCE(_role,'assignee'), _actor)
  ON CONFLICT (task_id, user_id, role)
  DO UPDATE SET assigned_by = _actor, assigned_at = now();
  PERFORM public._emit_outbox_event(_task.tenant_id, 'task.task.assigned', 'task', _task.id::text,
    jsonb_build_object('task_id', _task.id, 'assignee_id', _assignee_id, 'role', COALESCE(_role,'assignee'), 'actor_id', _actor),
    _idempotency_key, _correlation_id);
  RETURN _task;
END $function$;

-- 3) create_task: honour idempotency key (return the already-created task instead of duplicating)
CREATE OR REPLACE FUNCTION public.create_task(
  _workspace_id uuid, _title text, _description text DEFAULT NULL::text,
  _priority task_priority DEFAULT 'normal'::task_priority,
  _due_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _assignee_id uuid DEFAULT NULL::uuid,
  _idempotency_key text DEFAULT NULL::text, _correlation_id text DEFAULT NULL::text)
RETURNS tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _actor uuid := auth.uid(); _tenant uuid; _task public.tasks; _existing_id uuid;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  _tenant := public._resolve_workspace_tenant(_workspace_id);

  IF _idempotency_key IS NOT NULL THEN
    SELECT (o.payload->>'task_id')::uuid INTO _existing_id
    FROM public.outbox_events o
    WHERE o.tenant_id = _tenant
      AND o.event_type = 'task.task.created'
      AND o.idempotency_key = _idempotency_key
    LIMIT 1;
    IF _existing_id IS NOT NULL THEN
      SELECT * INTO _task FROM public.tasks WHERE id = _existing_id;
      IF _task.id IS NOT NULL THEN RETURN _task; END IF;
    END IF;
  END IF;

  IF NOT public.check_quota(_tenant, 'tasks.active', 1) THEN
    PERFORM public._raise_quota_exceeded(_tenant, 'tasks.active', 1);
  END IF;

  INSERT INTO public.tasks(workspace_id, title, description, priority, due_at, created_by, updated_by)
  VALUES (_workspace_id, _title, _description, COALESCE(_priority,'normal'), _due_at, _actor, _actor)
  RETURNING * INTO _task;

  IF _assignee_id IS NOT NULL THEN
    INSERT INTO public.task_assignees(task_id, user_id, role, assigned_by)
    VALUES (_task.id, _assignee_id, 'assignee', _actor)
    ON CONFLICT (task_id, user_id, role) DO NOTHING;
  END IF;

  PERFORM public.record_usage(_tenant, 'tasks.active', 1, _idempotency_key, _correlation_id, _workspace_id, '{}'::jsonb);
  PERFORM public._emit_outbox_event(_tenant, 'task.task.created', 'task', _task.id::text,
    jsonb_build_object('task_id', _task.id, 'workspace_id', _workspace_id, 'title', _title,
      'priority', _task.priority, 'assignee_id', _assignee_id, 'created_by', _actor),
    _idempotency_key, _correlation_id);
  RETURN _task;
END $function$;