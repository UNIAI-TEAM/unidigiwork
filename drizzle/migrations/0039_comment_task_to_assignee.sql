CREATE OR REPLACE FUNCTION public.comment_task_to_assignee(
  _task_id uuid,
  _recipient_id uuid,
  _body text,
  _idempotency_key text,
  _correlation_id text DEFAULT NULL
) RETURNS public.task_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _task public.tasks;
  _comment public.task_comments;
  _existing_comment_id uuid;
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF _idempotency_key IS NULL OR btrim(_idempotency_key) = '' THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _task
  FROM public.tasks
  WHERE id = _task_id AND deleted_at IS NULL;

  IF _task.id IS NULL THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_tenant_member(_task.tenant_id) THEN
    RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.task_assignees ta
    WHERE ta.task_id = _task_id
      AND ta.tenant_id = _task.tenant_id
      AND ta.user_id = _recipient_id
  ) THEN
    RAISE EXCEPTION 'RECIPIENT_NOT_TASK_ASSIGNEE' USING ERRCODE = '42501';
  END IF;

  SELECT NULLIF(payload->>'comment_id', '')::uuid
  INTO _existing_comment_id
  FROM public.outbox_events
  WHERE event_type = 'task.task.message_sent'
    AND idempotency_key = _idempotency_key
  LIMIT 1;

  IF _existing_comment_id IS NOT NULL THEN
    SELECT * INTO _comment
    FROM public.task_comments
    WHERE id = _existing_comment_id AND deleted_at IS NULL;
    IF _comment.id IS NOT NULL THEN
      RETURN _comment;
    END IF;
  END IF;

  INSERT INTO public.task_comments(task_id, author_id, body)
  VALUES (_task_id, _actor, _body)
  RETURNING * INTO _comment;

  PERFORM public._emit_outbox_event(
    _task.tenant_id,
    'task.task.message_sent',
    'task',
    _task.id::text,
    jsonb_build_object(
      'task_id', _task.id,
      'comment_id', _comment.id,
      'author_id', _actor,
      'recipient_user_ids', jsonb_build_array(_recipient_id::text),
      'title', 'Tin nhắn mới trong công việc',
      'body', left(_body, 500),
      'href', '/m/tasks/' || _task.id::text
    ),
    _idempotency_key,
    _correlation_id
  );

  RETURN _comment;
END;
$$;

REVOKE ALL ON FUNCTION public.comment_task_to_assignee(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comment_task_to_assignee(uuid, uuid, text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.comment_task_to_assignee(uuid, uuid, text, text, text) IS
  'Atomically stores a task message and emits a targeted notification after tenant and assignee checks.';