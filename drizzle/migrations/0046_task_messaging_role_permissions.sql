CREATE OR REPLACE FUNCTION public.get_task_messaging_permissions(_task_id uuid)
RETURNS TABLE (can_message_team boolean, can_message_superior boolean, can_ask_uni_ai boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH access AS (
    SELECT tm.role,
           EXISTS (
             SELECT 1 FROM public.task_assignees ta
             WHERE ta.task_id = t.id
               AND ta.tenant_id = t.tenant_id
               AND ta.user_id = auth.uid()
           ) AS is_assignee
    FROM public.tasks t
    JOIN public.tenant_members tm
      ON tm.tenant_id = t.tenant_id
     AND tm.user_id = auth.uid()
     AND tm.status = 'active'
    WHERE t.id = _task_id
      AND t.deleted_at IS NULL
  )
  SELECT
    (role IN ('member','guest') AND is_assignee),
    (role IN ('member','guest') AND is_assignee),
    (role IN ('tenant_owner','tenant_admin','manager'))
  FROM access;
$$;
REVOKE ALL ON FUNCTION public.get_task_messaging_permissions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_task_messaging_permissions(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_task_superior_recipients(_task_id uuid)
RETURNS TABLE (id uuid, display_name text, primary_email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.display_name, u.primary_email
  FROM public.tasks t
  JOIN public.tenant_members caller
    ON caller.tenant_id = t.tenant_id
   AND caller.user_id = auth.uid()
   AND caller.status = 'active'
   AND caller.role IN ('member','guest')
  JOIN public.task_assignees sender_assignment
    ON sender_assignment.task_id = t.id
   AND sender_assignment.tenant_id = t.tenant_id
   AND sender_assignment.user_id = auth.uid()
  JOIN public.tenant_members superior
    ON superior.tenant_id = t.tenant_id
   AND superior.status = 'active'
   AND superior.role IN ('tenant_owner','tenant_admin','manager')
  JOIN public.users u ON u.id = superior.user_id
  WHERE t.id = _task_id
    AND t.deleted_at IS NULL
  ORDER BY COALESCE(NULLIF(u.display_name, ''), u.primary_email, u.id::text);
$$;
REVOKE ALL ON FUNCTION public.list_task_superior_recipients(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_task_superior_recipients(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.comment_task_to_assignee(
  _task_id uuid,
  _recipient_id uuid,
  _body text,
  _idempotency_key text,
  _correlation_id text,
  _source text
) RETURNS public.task_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _task public.tasks;
  _comment public.task_comments;
  _existing uuid;
  _src text := upper(coalesce(_source, 'TASK_CHAT'));
  _actor_role public.tenant_role;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF nullif(btrim(_idempotency_key),'') IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE='22023'; END IF;
  IF _src NOT IN ('TASK_CHAT','PRIVATE_SUPERIOR') THEN RAISE EXCEPTION 'INVALID_MESSAGE_SOURCE' USING ERRCODE='22023'; END IF;
  SELECT * INTO _task FROM public.tasks WHERE id=_task_id AND deleted_at IS NULL;
  IF _task.id IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0002'; END IF;

  SELECT tm.role INTO _actor_role
  FROM public.tenant_members tm
  WHERE tm.tenant_id=_task.tenant_id AND tm.user_id=_actor AND tm.status='active';
  IF _actor_role IS NULL THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF _actor_role NOT IN ('member','guest') THEN RAISE EXCEPTION 'TASK_MESSAGE_ROLE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.task_assignees ta
    WHERE ta.task_id=_task_id AND ta.tenant_id=_task.tenant_id AND ta.user_id=_actor
  ) THEN RAISE EXCEPTION 'TASK_MESSAGE_SENDER_NOT_ASSIGNED' USING ERRCODE='42501'; END IF;

  IF _src='TASK_CHAT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.task_assignees ta
      JOIN public.tenant_members tm ON tm.tenant_id=ta.tenant_id AND tm.user_id=ta.user_id AND tm.status='active'
      WHERE ta.task_id=_task_id AND ta.tenant_id=_task.tenant_id AND ta.user_id=_recipient_id
    ) THEN RAISE EXCEPTION 'RECIPIENT_NOT_TASK_ASSIGNEE' USING ERRCODE='42501'; END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id=_task.tenant_id AND tm.user_id=_recipient_id AND tm.status='active'
        AND tm.role IN ('tenant_owner','tenant_admin','manager')
    ) THEN RAISE EXCEPTION 'RECIPIENT_NOT_SUPERIOR' USING ERRCODE='42501'; END IF;
  END IF;

  SELECT nullif(payload->>'comment_id','')::uuid INTO _existing
  FROM public.outbox_events
  WHERE event_type='task.task.message_sent' AND idempotency_key=_idempotency_key LIMIT 1;
  IF _existing IS NOT NULL THEN
    SELECT * INTO _comment FROM public.task_comments WHERE id=_existing AND deleted_at IS NULL;
    IF _comment.id IS NOT NULL THEN RETURN _comment; END IF;
  END IF;

  INSERT INTO public.task_comments(task_id,author_id,body,metadata)
  VALUES (_task_id,_actor,_body,jsonb_build_object('source',_src,'recipient_id',_recipient_id,'classification',jsonb_build_object('status','PENDING')))
  RETURNING * INTO _comment;

  PERFORM public._emit_outbox_event(
    _task.tenant_id,'task.task.message_sent','task',_task.id::text,
    jsonb_build_object(
      'task_id',_task.id,'comment_id',_comment.id,'author_id',_actor,
      'recipient_user_ids',jsonb_build_array(_recipient_id::text),
      'title',CASE WHEN _src='PRIVATE_SUPERIOR' THEN 'Tin nhắn riêng từ nhân viên' ELSE 'Tin nhắn mới trong công việc' END,
      'body',left(_body,500),'href','/m/tasks/'||_task.id::text,'source',_src
    ),_idempotency_key,_correlation_id
  );
  RETURN _comment;
END;
$$;
REVOKE ALL ON FUNCTION public.comment_task_to_assignee(uuid,uuid,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comment_task_to_assignee(uuid,uuid,text,text,text,text) TO authenticated, service_role;