CREATE TABLE public.consultation_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  request_id uuid,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  meeting_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
  service text,
  customer_name text NOT NULL,
  preferred_start_at timestamptz NOT NULL,
  tracking_token_hash text NOT NULL UNIQUE,
  guest_invite_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.consultation_bookings TO service_role;
ALTER TABLE public.consultation_bookings ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.consultation_bookings IS 'Website consultation bookings; read only via token-gated SECURITY DEFINER RPCs.';

CREATE OR REPLACE FUNCTION public.submit_consultation_booking(
  _name text, _email text, _phone text, _company text, _service text, _message text, _preferred_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $fn$
DECLARE _ws uuid; _tenant uuid; _req uuid; _task uuid; _slug text; _owner uuid; _meeting uuid;
        _track text; _invite text; _svc text := coalesce(nullif(btrim(_service),''),'Chung');
BEGIN
  IF length(btrim(coalesce(_name,''))) NOT BETWEEN 1 AND 120
     OR coalesce(_email,'') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(_email) > 200
     OR length(coalesce(_phone,'')) > 40 OR length(coalesce(_company,'')) > 200
     OR length(coalesce(_service,'')) > 120 OR length(coalesce(_message,'')) > 4000
     OR _preferred_at IS NULL OR _preferred_at < now() + interval '30 minutes'
     OR _preferred_at > now() + interval '90 days' THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;
  INSERT INTO public.demo_requests(name, email, role, source, notes)
  VALUES (btrim(_name), lower(btrim(_email)), coalesce(nullif(btrim(_company),''),'—'), 'website_consult',
          concat_ws(E'\n', 'Dịch vụ: '||_svc, 'SĐT: '||nullif(_phone,''), 'Lịch hẹn: '||_preferred_at, nullif(_message,'')))
  RETURNING id INTO _req;

  SELECT nullif(value->>'workspace_id','')::uuid INTO _ws FROM public.cms_settings WHERE key = 'lead_workspace';
  IF _ws IS NOT NULL THEN
    SELECT tenant_id INTO _tenant FROM public.workspaces WHERE id = _ws AND deleted_at IS NULL;
  END IF;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'CONSULTATION_UNAVAILABLE'; END IF;

  SELECT slug INTO _slug FROM public.cms_entries
   WHERE kind = 'service' AND status = 'published' AND (title = btrim(_service) OR slug = btrim(_service)) LIMIT 1;
  IF _slug IS NOT NULL THEN
    SELECT nullif(value->>_slug,'')::uuid INTO _owner FROM public.cms_settings WHERE key = 'consultation_routing';
    IF _owner IS NOT NULL AND NOT public.is_workspace_member(_ws, _owner) THEN _owner := NULL; END IF;
  END IF;

  INSERT INTO public.meetings(tenant_id, workspace_id, title, agenda, start_at, end_at, timezone, conference_provider, access_policy, idempotency_key)
  VALUES (_tenant, _ws, left('Tư vấn: '||_svc||' — '||btrim(_name), 500),
          concat_ws(E'\n', 'Khách: '||btrim(_name), 'Công ty: '||nullif(_company,''), nullif(_message,'')),
          _preferred_at, _preferred_at + interval '45 minutes', 'Asia/Ho_Chi_Minh', 'livekit', 'tenant_open', 'consult:'||_req)
  RETURNING id INTO _meeting;
  IF _owner IS NOT NULL THEN
    INSERT INTO public.meeting_participants(meeting_id, user_id, tenant_id, role, rsvp)
    VALUES (_meeting, _owner, _tenant, 'host', 'accepted') ON CONFLICT DO NOTHING;
  END IF;
  _invite := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  INSERT INTO public.meeting_invite_links(tenant_id, meeting_id, token_hash, label, expires_at, allow_guests)
  VALUES (_tenant, _meeting, encode(digest(_invite,'sha256'),'hex'), left('Khách: '||btrim(_name),120),
          _preferred_at + interval '1 day', true);

  INSERT INTO public.tasks(tenant_id, workspace_id, title, description, priority, tags, due_at, human_owner_id)
  VALUES (_tenant, _ws, left('Tư vấn: '||_svc||' — '||btrim(_name), 500),
          concat_ws(E'\n', 'Khách: '||btrim(_name), 'Email: '||_email, 'SĐT: '||nullif(_phone,''),
                    'Công ty: '||nullif(_company,''), 'Dịch vụ: '||_svc,
                    'Lịch hẹn: '||to_char(_preferred_at AT TIME ZONE 'Asia/Ho_Chi_Minh','HH24:MI DD/MM/YYYY')||' (giờ VN)',
                    'Cuộc họp: /meeting/'||_meeting, '', nullif(_message,''), '', 'Nguồn: website (yêu cầu '||_req||')'),
          'high', array_remove(ARRAY['consultation','website','booking', CASE WHEN _slug IS NOT NULL THEN 'service:'||_slug END], NULL),
          _preferred_at, _owner)
  RETURNING id INTO _task;

  IF _owner IS NOT NULL THEN
    INSERT INTO public.task_assignees(task_id, user_id, tenant_id, role, assigned_by)
    VALUES (_task, _owner, _tenant, 'assignee', NULL) ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications(user_id, workspace_id, tenant_id, type, title, body, link, meta)
    VALUES (_owner, _ws, _tenant, 'task_assigned', left('Lịch tư vấn mới: '||_svc, 200),
            left(btrim(_name)||' — '||to_char(_preferred_at AT TIME ZONE 'Asia/Ho_Chi_Minh','HH24:MI DD/MM'), 300),
            '/tasks/'||_task, jsonb_build_object('task_id', _task, 'meeting_id', _meeting, 'source', 'website_consult'));
  END IF;

  _track := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  INSERT INTO public.consultation_bookings(tenant_id, request_id, task_id, meeting_id, service, customer_name,
    preferred_start_at, tracking_token_hash, guest_invite_token)
  VALUES (_tenant, _req, _task, _meeting, _svc, btrim(_name), _preferred_at, encode(digest(_track,'sha256'),'hex'), _invite);

  PERFORM public._emit_outbox_event(_tenant, 'task.task.created', 'task', _task::text,
    jsonb_build_object('task_id', _task, 'meeting_id', _meeting, 'source', 'website_consult', 'service', _slug, 'assignee_id', _owner),
    'consult:'||_req::text, NULL);
  INSERT INTO public.audit_events(tenant_id, actor_user_id, action, resource_type, resource_id, payload)
  VALUES (_tenant, NULL, 'consultation.booked', 'task', _task,
          jsonb_build_object('request_id', _req, 'meeting_id', _meeting, 'service', _slug, 'assignee_id', _owner));
  RETURN jsonb_build_object('ok', true, 'token', _track, 'task_id', _task, 'meeting_id', _meeting);
END $fn$;

CREATE OR REPLACE FUNCTION public.get_consultation_booking(_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $fn$
DECLARE b public.consultation_bookings; t public.tasks; m public.meetings;
BEGIN
  IF _token IS NULL OR length(_token) <> 64 THEN RETURN NULL; END IF;
  SELECT * INTO b FROM public.consultation_bookings WHERE tracking_token_hash = encode(digest(_token,'sha256'),'hex');
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO t FROM public.tasks WHERE id = b.task_id;
  SELECT * INTO m FROM public.meetings WHERE id = b.meeting_id AND deleted_at IS NULL;
  RETURN jsonb_build_object('service', b.service, 'name', b.customer_name, 'created_at', b.created_at,
    'task_status', t.status, 'assigned', t.human_owner_id IS NOT NULL,
    'start_at', coalesce(m.start_at, b.preferred_start_at), 'end_at', m.end_at, 'meeting_status', m.status,
    'meeting_id', m.id, 'invite', CASE WHEN m.id IS NOT NULL AND m.status <> 'canceled' THEN b.guest_invite_token END);
END $fn$;

REVOKE ALL ON FUNCTION public.submit_consultation_booking(text,text,text,text,text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_consultation_booking(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_consultation_booking(text,text,text,text,text,text,timestamptz) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_consultation_booking(text) TO anon, authenticated, service_role;