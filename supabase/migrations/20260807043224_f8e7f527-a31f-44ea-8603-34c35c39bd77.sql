
-- 1. Attachments
CREATE TABLE public.task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_attachments_task_idx ON public.task_attachments(task_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_attachments TO authenticated;
GRANT ALL ON public.task_attachments TO service_role;
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_attachments_tenant_select ON public.task_attachments FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY task_attachments_tenant_write ON public.task_attachments FOR ALL TO authenticated USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));
CREATE TRIGGER task_attachments_set_updated_at BEFORE UPDATE ON public.task_attachments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Reminder dedupe log
CREATE TABLE public.task_due_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id),
  kind text NOT NULL,
  due_at timestamptz NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, kind, due_at)
);
GRANT SELECT ON public.task_due_reminders TO authenticated;
GRANT ALL ON public.task_due_reminders TO service_role;
ALTER TABLE public.task_due_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_due_reminders_tenant_select ON public.task_due_reminders FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

-- 3. create_subtask
CREATE OR REPLACE FUNCTION public.create_subtask(
  _parent_task_id uuid,
  _title text,
  _priority public.task_priority DEFAULT 'normal',
  _due_at timestamptz DEFAULT NULL,
  _idempotency_key text DEFAULT NULL,
  _correlation_id text DEFAULT NULL
) RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _parent public.tasks; _task public.tasks;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _parent FROM public.tasks WHERE id = _parent_task_id AND deleted_at IS NULL;
  IF _parent IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_parent.tenant_id) THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT public.check_quota(_parent.tenant_id, 'tasks.active', 1) THEN
    PERFORM public._raise_quota_exceeded(_parent.tenant_id, 'tasks.active', 1);
  END IF;
  INSERT INTO public.tasks(workspace_id, parent_task_id, title, priority, due_at, created_by, updated_by)
  VALUES (_parent.workspace_id, _parent_task_id, _title, COALESCE(_priority,'normal'), _due_at, _actor, _actor)
  RETURNING * INTO _task;
  PERFORM public.record_usage(_parent.tenant_id, 'tasks.active', 1, _idempotency_key, _correlation_id, _parent.workspace_id, '{}'::jsonb);
  PERFORM public._emit_outbox_event(_parent.tenant_id, 'task.task.created', 'task', _task.id::text,
    jsonb_build_object('task_id', _task.id, 'parent_task_id', _parent_task_id, 'workspace_id', _parent.workspace_id, 'title', _title),
    _idempotency_key, _correlation_id);
  RETURN _task;
END $$;
REVOKE ALL ON FUNCTION public.create_subtask(uuid, text, public.task_priority, timestamptz, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_subtask(uuid, text, public.task_priority, timestamptz, text, text) TO authenticated;

-- 4. Due-date reminder dispatcher
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
      jsonb_build_object('task_id', _row.id, 'due_at', _row.due_at, 'kind', _kind), 'workspace'
    FROM unnest(
      CASE WHEN array_length(_row.assignees, 1) IS NULL
        THEN ARRAY[_row.created_by] ELSE _row.assignees END
    ) AS u
    WHERE u IS NOT NULL;
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END $$;
REVOKE ALL ON FUNCTION public.dispatch_task_due_reminders() FROM public;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('task-due-reminders', '*/15 * * * *', $$SELECT public.dispatch_task_due_reminders();$$);
