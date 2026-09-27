CREATE OR REPLACE FUNCTION public.submit_consultation_request(
  _name text, _email text, _phone text, _company text, _service text, _message text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ws uuid; _tenant uuid; _req uuid; _task uuid; _slug text; _owner uuid; _assigned boolean := false;
BEGIN
  IF length(btrim(coalesce(_name,''))) NOT BETWEEN 1 AND 120
     OR coalesce(_email,'') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(_email) > 200
     OR length(coalesce(_phone,'')) > 40 OR length(coalesce(_company,'')) > 200
     OR length(coalesce(_service,'')) > 120 OR length(coalesce(_message,'')) > 4000 THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;
  INSERT INTO public.demo_requests(name, email, role, source, notes)
  VALUES (btrim(_name), lower(btrim(_email)), coalesce(nullif(btrim(_company),''),'—'), 'website_consult',
          concat_ws(E'\n', 'Dịch vụ: '||nullif(_service,''), 'SĐT: '||nullif(_phone,''), nullif(_message,'')))
  RETURNING id INTO _req;
  SELECT nullif(value->>'workspace_id','')::uuid INTO _ws FROM public.cms_settings WHERE key = 'lead_workspace';
  IF _ws IS NULL THEN RETURN jsonb_build_object('ok', true, 'routed', false); END IF;
  SELECT tenant_id INTO _tenant FROM public.workspaces WHERE id = _ws AND deleted_at IS NULL;
  IF _tenant IS NULL THEN RETURN jsonb_build_object('ok', true, 'routed', false); END IF;

  SELECT slug INTO _slug FROM public.cms_entries
   WHERE kind = 'service' AND status = 'published' AND (title = btrim(_service) OR slug = btrim(_service)) LIMIT 1;
  IF _slug IS NOT NULL THEN
    SELECT nullif(value->>_slug,'')::uuid INTO _owner FROM public.cms_settings WHERE key = 'consultation_routing';
    IF _owner IS NOT NULL AND NOT public.is_workspace_member(_ws, _owner) THEN _owner := NULL; END IF;
  END IF;

  INSERT INTO public.tasks(tenant_id, workspace_id, title, description, priority, tags, due_at, human_owner_id)
  VALUES (_tenant, _ws, left('Tư vấn: '||coalesce(nullif(_service,''),'Chung')||' — '||btrim(_name), 500),
          concat_ws(E'\n', 'Khách: '||btrim(_name), 'Email: '||_email, 'SĐT: '||nullif(_phone,''),
                    'Công ty: '||nullif(_company,''), 'Dịch vụ: '||nullif(_service,''), '', nullif(_message,''),
                    '', 'Nguồn: website (yêu cầu '||_req||')'),
          'high', array_remove(ARRAY['consultation','website', CASE WHEN _slug IS NOT NULL THEN 'service:'||_slug END], NULL),
          now() + interval '1 day', _owner)
  RETURNING id INTO _task;

  IF _owner IS NOT NULL THEN
    INSERT INTO public.task_assignees(task_id, user_id, tenant_id, role, assigned_by)
    VALUES (_task, _owner, _tenant, 'assignee', NULL) ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications(user_id, workspace_id, tenant_id, type, title, body, link, meta)
    VALUES (_owner, _ws, _tenant, 'task_assigned',
            left('Yêu cầu tư vấn mới: '||coalesce(nullif(_service,''),'Chung'), 200),
            left(btrim(_name)||coalesce(' — '||nullif(btrim(_company),''),''), 300),
            '/tasks/'||_task, jsonb_build_object('task_id', _task, 'source', 'website_consult', 'service', _slug));
    _assigned := true;
  END IF;

  PERFORM public._emit_outbox_event(_tenant, 'task.task.created', 'task', _task::text,
    jsonb_build_object('task_id', _task, 'source', 'website_consult', 'service', _slug, 'assignee_id', _owner),
    'consult:'||_req::text, NULL);
  INSERT INTO public.audit_events(tenant_id, actor_user_id, action, resource_type, resource_id, payload)
  VALUES (_tenant, NULL, 'consultation.requested', 'task', _task,
          jsonb_build_object('request_id', _req, 'service', _slug, 'assignee_id', _owner));
  RETURN jsonb_build_object('ok', true, 'routed', true, 'assigned', _assigned);
END $$;
REVOKE ALL ON FUNCTION public.submit_consultation_request(text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_consultation_request(text,text,text,text,text,text) TO anon, authenticated, service_role;