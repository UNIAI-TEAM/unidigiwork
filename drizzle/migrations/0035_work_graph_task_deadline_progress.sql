CREATE OR REPLACE FUNCTION public.refresh_task_work_graph_state(_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task public.tasks;
  _total integer := 0;
  _completed integer := 0;
  _progress integer;
  _due_state text;
BEGIN
  SELECT * INTO _task
  FROM public.tasks
  WHERE id = _task_id AND deleted_at IS NULL;

  IF _task.id IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*)::integer,
         count(*) FILTER (WHERE upper(status) IN ('SUCCEEDED','DONE','COMPLETED','SKIPPED'))::integer
    INTO _total, _completed
  FROM public.work_execution_steps
  WHERE task_id = _task_id;

  _progress := CASE
    WHEN _total > 0 THEN round((_completed::numeric / _total::numeric) * 100)::integer
    WHEN _task.status IN ('done','canceled') THEN 100
    WHEN _task.status = 'in_progress' THEN 50
    WHEN _task.status = 'blocked' THEN 35
    ELSE 5
  END;

  _due_state := CASE
    WHEN _task.due_at IS NULL OR _task.status IN ('done','canceled') THEN NULL
    WHEN _task.due_at < now() THEN 'overdue'
    WHEN _task.due_at < now() + interval '24 hours' THEN 'due_soon'
    ELSE 'scheduled'
  END;

  UPDATE public.work_nodes
     SET metadata = (COALESCE(metadata, '{}'::jsonb)
       || jsonb_build_object(
         'progress', _progress,
         'completed_steps', _completed,
         'total_steps', _total,
         'due_at', _task.due_at,
         'due_state', _due_state,
         'task_state_refreshed_at', now()
       )),
       updated_at = now()
   WHERE entity_type = 'TASK'
     AND entity_id = _task.id
     AND tenant_id = _task.tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_task_work_graph_state(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.refresh_task_work_graph_state(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_task_step_work_graph_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_task_work_graph_state(COALESCE(NEW.task_id, OLD.task_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_task_step_work_graph_state() FROM public;
GRANT EXECUTE ON FUNCTION public.sync_task_step_work_graph_state() TO service_role;

DROP TRIGGER IF EXISTS trg_sync_task_step_work_graph_state ON public.work_execution_steps;
CREATE TRIGGER trg_sync_task_step_work_graph_state
AFTER INSERT OR UPDATE OF status OR DELETE ON public.work_execution_steps
FOR EACH ROW EXECUTE FUNCTION public.sync_task_step_work_graph_state();

CREATE OR REPLACE FUNCTION public.dispatch_task_due_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
  _kind text;
  _count integer := 0;
  _inserted boolean;
BEGIN
  FOR _row IN
    SELECT t.id, t.tenant_id, t.workspace_id, t.title, t.due_at, t.created_by,
           ARRAY(SELECT ta.user_id FROM public.task_assignees ta WHERE ta.task_id = t.id) AS assignees
    FROM public.tasks t
    WHERE t.deleted_at IS NULL
      AND t.due_at IS NOT NULL
      AND t.tenant_id IS NOT NULL
      AND t.status NOT IN ('done','canceled')
      AND t.due_at < now() + interval '24 hours'
  LOOP
    _kind := CASE WHEN _row.due_at < now() THEN 'overdue' ELSE 'due_soon' END;
    _inserted := false;

    INSERT INTO public.task_due_reminders(task_id, tenant_id, kind, due_at)
    VALUES (_row.id, _row.tenant_id, _kind, _row.due_at)
    ON CONFLICT (task_id, kind, due_at) DO NOTHING
    RETURNING true INTO _inserted;

    IF COALESCE(_inserted, false) THEN
      INSERT INTO public.notifications(user_id, workspace_id, tenant_id, type, title, body, link, meta, scope_type)
      SELECT u, _row.workspace_id, _row.tenant_id, 'task',
        CASE WHEN _kind = 'overdue' THEN 'Công việc quá hạn' ELSE 'Công việc sắp đến hạn' END,
        _row.title, '/tasks/' || _row.id::text,
        jsonb_build_object('task_id', _row.id, 'due_at', _row.due_at, 'kind', _kind), 'tenant'
      FROM unnest(
        CASE WHEN array_length(_row.assignees, 1) IS NULL
          THEN ARRAY[_row.created_by] ELSE _row.assignees END
      ) AS u
      WHERE u IS NOT NULL;
      _count := _count + 1;
    END IF;

    PERFORM public.refresh_task_work_graph_state(_row.id);
  END LOOP;
  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_task_due_reminders() FROM public;
GRANT EXECUTE ON FUNCTION public.dispatch_task_due_reminders() TO service_role;

CREATE OR REPLACE FUNCTION public.set_task_due_at(
  _task_id uuid,
  _due_at timestamptz DEFAULT NULL,
  _idempotency_key text DEFAULT NULL,
  _correlation_id text DEFAULT NULL
) RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _actor uuid := auth.uid(); _task public.tasks;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _task FROM public.tasks WHERE id = _task_id AND deleted_at IS NULL;
  IF _task.id IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_task.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

  UPDATE public.tasks SET due_at = _due_at, updated_by = _actor
   WHERE id = _task_id RETURNING * INTO _task;

  DELETE FROM public.task_due_reminders WHERE task_id = _task_id;
  PERFORM public.refresh_task_work_graph_state(_task_id);

  PERFORM public._emit_outbox_event(_task.tenant_id, 'task.task.updated', 'task', _task.id::text,
    jsonb_build_object('task_id', _task.id, 'actor_id', _actor, 'due_at', _due_at,
                       'row_version', _task.row_version),
    _idempotency_key, _correlation_id);
  RETURN _task;
END;
$$;

REVOKE ALL ON FUNCTION public.set_task_due_at(uuid, timestamptz, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_task_due_at(uuid, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_task_due_at(uuid, timestamptz, text, text) TO service_role;

DO $$
DECLARE _task_id uuid;
BEGIN
  FOR _task_id IN SELECT id FROM public.tasks WHERE deleted_at IS NULL
  LOOP
    PERFORM public.refresh_task_work_graph_state(_task_id);
  END LOOP;
END;
$$;