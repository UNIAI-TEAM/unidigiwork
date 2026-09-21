CREATE OR REPLACE FUNCTION public.dispatch_task_due_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row record; _kind text; _count integer := 0;
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
    BEGIN
      INSERT INTO public.task_due_reminders(task_id, tenant_id, kind, due_at)
      VALUES (_row.id, _row.tenant_id, _kind, _row.due_at);
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;

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

    -- Work Graph: ghi trạng thái hạn vào node TASK (projection, không tạo node mới).
    UPDATE public.work_nodes
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
             'due_at', _row.due_at,
             'due_state', _kind,
             'due_reminded_at', now()
           ),
           updated_at = now()
     WHERE entity_type = 'TASK'
       AND entity_id = _row.id
       AND tenant_id = _row.tenant_id;

    _count := _count + 1;
  END LOOP;
  RETURN _count;
END $$;

REVOKE ALL ON FUNCTION public.dispatch_task_due_reminders() FROM public;