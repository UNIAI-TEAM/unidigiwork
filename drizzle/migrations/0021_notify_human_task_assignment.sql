CREATE OR REPLACE FUNCTION public.notify_human_task_assignment(
  _task_id uuid,
  _assignee_id uuid,
  _idempotency_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task record;
  v_email text;
  v_name text;
  v_event_id uuid;
  v_href text;
BEGIN
  SELECT t.id, t.title, t.workspace_id, t.tenant_id, t.due_at
    INTO v_task
    FROM public.tasks t
   WHERE t.id = _task_id AND t.deleted_at IS NULL;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members m
     WHERE m.workspace_id = v_task.workspace_id AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members m
     WHERE m.workspace_id = v_task.workspace_id AND m.user_id = _assignee_id
  ) THEN
    RAISE EXCEPTION 'ASSIGNEE_NOT_MEMBER';
  END IF;

  SELECT p.email, COALESCE(p.display_name, p.email)
    INTO v_email, v_name
    FROM public.profiles p
   WHERE p.id = _assignee_id;

  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'ASSIGNEE_EMAIL_MISSING';
  END IF;

  v_href := '/tasks/' || v_task.id::text;

  INSERT INTO public.outbox_events(
    tenant_id, event_type, event_version, aggregate_type, aggregate_id,
    payload, idempotency_key
  )
  VALUES (
    v_task.tenant_id,
    'task.assigned.human',
    1,
    'TASK',
    v_task.id,
    jsonb_build_object(
      'title', 'Bạn được giao việc mới',
      'body', v_task.title,
      'href', v_href,
      'notify_user_ids', jsonb_build_array(_assignee_id::text),
      'email', jsonb_build_object(
        'to', jsonb_build_array(v_email),
        'subject', 'UNIWORK · Việc mới: ' || v_task.title,
        'html',
          '<p>Xin chào ' || coalesce(v_name, '') || ',</p>' ||
          '<p>Bạn vừa được giao công việc: <strong>' || v_task.title || '</strong></p>' ||
          CASE WHEN v_task.due_at IS NULL THEN ''
               ELSE '<p>Hạn hoàn thành: ' || to_char(v_task.due_at, 'DD/MM/YYYY HH24:MI') || '</p>' END ||
          '<p>Mở công việc trong UNIWORK để xem chi tiết.</p>'
      )
    ),
    _idempotency_key
  )
  ON CONFLICT (event_type, idempotency_key) DO NOTHING
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_human_task_assignment(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_human_task_assignment(uuid, uuid, text) TO authenticated;