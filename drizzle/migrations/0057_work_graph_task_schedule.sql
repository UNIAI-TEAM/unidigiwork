CREATE OR REPLACE FUNCTION public.get_work_graph_task_schedule(_tenant_id uuid, _task_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
WITH task AS (
  SELECT t.*
    FROM public.tasks t
   WHERE t.id = _task_id AND t.tenant_id = _tenant_id AND t.deleted_at IS NULL
),
children AS (
  SELECT c.id, c.title, c.status::text AS status, c.due_at, c.completed_at, c.start_at
    FROM public.tasks c
   WHERE c.parent_task_id = _task_id AND c.tenant_id = _tenant_id AND c.deleted_at IS NULL
),
steps AS (
  SELECT s.id, s.title, s.status, s.seq, s.started_at, s.completed_at
    FROM public.work_execution_steps s
   WHERE s.task_id = _task_id AND s.tenant_id = _tenant_id
),
milestones AS (
  SELECT jsonb_build_object(
           'id', c.id::text, 'kind', 'SUBTASK', 'title', c.title,
           'status', c.status,
           'at', COALESCE(c.completed_at, c.due_at, c.start_at),
           'done', c.status = 'done'
         ) AS m,
         COALESCE(c.completed_at, c.due_at, c.start_at) AS at_ts,
         0 AS seq
    FROM children c
  UNION ALL
  SELECT jsonb_build_object(
           'id', s.id::text, 'kind', 'STEP', 'title', s.title,
           'status', s.status,
           'at', COALESCE(s.completed_at, s.started_at),
           'done', s.status IN ('SUCCEEDED', 'ACCEPTED', 'DONE')
         ),
         COALESCE(s.completed_at, s.started_at),
         s.seq
    FROM steps s
)
SELECT CASE WHEN (SELECT count(*) FROM task) = 0 THEN NULL ELSE jsonb_build_object(
  'task_id', (SELECT id::text FROM task),
  'title', (SELECT title FROM task),
  'status', (SELECT status::text FROM task),
  'progress', (SELECT COALESCE(progress_pct, 0) FROM task),
  'created_at', (SELECT created_at FROM task),
  'start_at', (SELECT COALESCE(start_at, created_at) FROM task),
  'start_explicit', (SELECT start_at IS NOT NULL FROM task),
  'end_at', (SELECT COALESCE(end_at, due_at, completed_at) FROM task),
  'end_explicit', (SELECT end_at IS NOT NULL FROM task),
  'due_at', (SELECT due_at FROM task),
  'completed_at', (SELECT completed_at FROM task),
  'updated_at', (SELECT updated_at FROM task),
  'milestones', COALESCE((SELECT jsonb_agg(m ORDER BY at_ts NULLS LAST, seq) FROM milestones), '[]'::jsonb)
) END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_work_graph_task_schedule(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_work_graph_task_schedule(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.set_task_schedule(
  _task_id uuid,
  _start_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _end_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _idempotency_key text DEFAULT NULL::text,
  _correlation_id text DEFAULT NULL::text
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _actor uuid := auth.uid(); _task public.tasks;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _task FROM public.tasks WHERE id = _task_id AND deleted_at IS NULL;
  IF _task.id IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_task.tenant_id) THEN
    RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  IF _start_at IS NOT NULL AND _end_at IS NOT NULL AND _end_at < _start_at THEN
    RAISE EXCEPTION 'TASK_SCHEDULE_INVALID' USING ERRCODE='22023';
  END IF;

  UPDATE public.tasks
     SET start_at = _start_at, end_at = _end_at, updated_by = _actor
   WHERE id = _task_id RETURNING * INTO _task;

  PERFORM public.refresh_task_work_graph_state(_task_id);

  PERFORM public._emit_outbox_event(_task.tenant_id, 'task.task.updated', 'task', _task.id::text,
    jsonb_build_object('task_id', _task.id, 'actor_id', _actor,
                       'start_at', _start_at, 'end_at', _end_at,
                       'row_version', _task.row_version),
    _idempotency_key, _correlation_id);
  RETURN _task;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_task_schedule(uuid, timestamptz, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_task_schedule(uuid, timestamptz, timestamptz, text, text) TO service_role;