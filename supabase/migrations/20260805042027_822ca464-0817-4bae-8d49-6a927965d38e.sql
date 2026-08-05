CREATE TABLE IF NOT EXISTS public.meeting_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending',
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_join_requests_status_chk CHECK (status IN ('pending','approved','rejected','canceled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS meeting_join_requests_open_uq
  ON public.meeting_join_requests(meeting_id, requester_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS meeting_join_requests_meeting_idx
  ON public.meeting_join_requests(meeting_id, status, created_at DESC);

GRANT SELECT ON public.meeting_join_requests TO authenticated;
GRANT ALL ON public.meeting_join_requests TO service_role;

ALTER TABLE public.meeting_join_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_meeting_access(_meeting_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.meetings m
     WHERE m.id = _meeting_id
       AND (
         m.created_by = _user_id
         OR EXISTS (
           SELECT 1 FROM public.tenant_members tm
            WHERE tm.tenant_id = m.tenant_id
              AND tm.user_id = _user_id
              AND tm.status = 'active'
              AND tm.role IN ('tenant_owner','tenant_admin','manager')
         )
         OR EXISTS (
           SELECT 1 FROM public.meeting_participants mp
            WHERE mp.meeting_id = m.id AND mp.user_id = _user_id
              AND mp.role IN ('host','organizer')
         )
       )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_meeting_access(uuid, uuid) TO authenticated;

CREATE POLICY "mjr_select_own" ON public.meeting_join_requests
  FOR SELECT TO authenticated
  USING (requester_id = auth.uid());

CREATE POLICY "mjr_select_host" ON public.meeting_join_requests
  FOR SELECT TO authenticated
  USING (public.can_manage_meeting_access(meeting_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.request_meeting_join(
  _meeting_id uuid,
  _message text DEFAULT NULL,
  _correlation_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _m public.meetings;
  _row public.meeting_join_requests;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;
  IF _m.status NOT IN ('scheduled','live') THEN
    RAISE EXCEPTION 'MEETING_NOT_JOINABLE' USING ERRCODE='55000';
  END IF;

  IF EXISTS (SELECT 1 FROM public.meeting_participants mp
              WHERE mp.meeting_id = _meeting_id AND mp.user_id = _actor) THEN
    RETURN jsonb_build_object('status', 'approved', 'already_participant', true, 'meeting_id', _meeting_id);
  END IF;

  SELECT * INTO _row FROM public.meeting_join_requests
   WHERE meeting_id = _meeting_id AND requester_id = _actor AND status = 'pending';
  IF FOUND THEN
    RETURN jsonb_build_object('status', _row.status, 'request_id', _row.id,
                              'meeting_id', _meeting_id, 'created_at', _row.created_at);
  END IF;

  INSERT INTO public.meeting_join_requests(tenant_id, meeting_id, requester_id, message, correlation_id)
  VALUES (_m.tenant_id, _meeting_id, _actor, NULLIF(btrim(COALESCE(_message,'')),''), _correlation_id)
  RETURNING * INTO _row;

  INSERT INTO public.notifications(user_id, workspace_id, tenant_id, type, title, body, link, scope_type, meta)
  SELECT DISTINCT hosts.u, _m.workspace_id, _m.tenant_id, 'meeting',
         'Yêu cầu tham gia cuộc họp',
         'Có người yêu cầu được tham gia "' || _m.title || '".',
         '/meeting/' || _meeting_id::text, 'tenant',
         jsonb_build_object('meeting_id', _meeting_id, 'request_id', _row.id)
    FROM (
      SELECT _m.created_by AS u
      UNION
      SELECT mp.user_id FROM public.meeting_participants mp
       WHERE mp.meeting_id = _meeting_id AND mp.role IN ('host','organizer')
    ) hosts
   WHERE hosts.u IS NOT NULL;

  PERFORM public._emit_outbox_event(_m.tenant_id, 'meeting.join_request.created', 'meeting',
    _meeting_id::text,
    jsonb_build_object('meeting_id', _meeting_id, 'request_id', _row.id, 'requester_id', _actor),
    _row.id::text, _correlation_id);

  RETURN jsonb_build_object('status', 'pending', 'request_id', _row.id,
                            'meeting_id', _meeting_id, 'created_at', _row.created_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_meeting_join_request(
  _request_id uuid,
  _approve boolean,
  _note text DEFAULT NULL,
  _correlation_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _row public.meeting_join_requests;
  _m public.meetings;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT * INTO _row FROM public.meeting_join_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;
  SELECT * INTO _m FROM public.meetings WHERE id = _row.meeting_id;

  IF NOT public.can_manage_meeting_access(_m.id, _actor) THEN
    RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  IF _row.status <> 'pending' THEN
    RETURN jsonb_build_object('status', _row.status, 'request_id', _row.id);
  END IF;

  UPDATE public.meeting_join_requests
     SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
         decided_by = _actor, decided_at = now(),
         decision_note = NULLIF(btrim(COALESCE(_note,'')),''),
         updated_at = now()
   WHERE id = _request_id
   RETURNING * INTO _row;

  IF _approve THEN
    INSERT INTO public.meeting_participants(meeting_id, user_id, tenant_id, role, rsvp, rsvp_at)
    VALUES (_m.id, _row.requester_id, _m.tenant_id, 'participant', 'accepted', now())
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
  END IF;

  INSERT INTO public.notifications(user_id, workspace_id, tenant_id, type, title, body, link, scope_type, meta)
  VALUES (_row.requester_id, _m.workspace_id, _m.tenant_id, 'meeting',
    CASE WHEN _approve THEN 'Yêu cầu tham gia đã được duyệt' ELSE 'Yêu cầu tham gia bị từ chối' END,
    _m.title, '/meeting/' || _m.id::text, 'tenant',
    jsonb_build_object('meeting_id', _m.id, 'request_id', _row.id, 'approved', _approve));

  PERFORM public._emit_outbox_event(_m.tenant_id,
    CASE WHEN _approve THEN 'meeting.join_request.approved' ELSE 'meeting.join_request.rejected' END,
    'meeting', _m.id::text,
    jsonb_build_object('meeting_id', _m.id, 'request_id', _row.id, 'requester_id', _row.requester_id),
    _row.id::text, _correlation_id);

  RETURN jsonb_build_object('status', _row.status, 'request_id', _row.id, 'meeting_id', _m.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_meeting_join_token(
  _meeting_id uuid,
  _token_fingerprint text,
  _expires_at timestamptz,
  _idempotency_key text DEFAULT NULL,
  _correlation_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor UUID := auth.uid();
  _m public.meetings;
  _role TEXT;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;

  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;

  SELECT mp.role INTO _role FROM public.meeting_participants mp
   WHERE mp.meeting_id = _meeting_id AND mp.user_id = _actor;

  IF _role IS NULL AND NOT public.is_tenant_member(_m.tenant_id) THEN
    RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  IF _role IS NULL THEN
    INSERT INTO public.meeting_participants(meeting_id, user_id, tenant_id, role, rsvp, rsvp_at)
    VALUES (_meeting_id, _actor, _m.tenant_id, 'participant', 'accepted', now())
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
    _role := 'participant';
  END IF;

  IF _m.status NOT IN ('scheduled','live') THEN
    RAISE EXCEPTION 'MEETING_NOT_JOINABLE' USING ERRCODE='55000';
  END IF;

  IF NOT public.check_quota(_m.tenant_id, 'meetings.conference', 0) THEN
    RAISE EXCEPTION 'ENTITLEMENT_DENIED: meetings.conference' USING ERRCODE='42501';
  END IF;
  IF NOT public.check_quota(_m.tenant_id, 'meeting_participant_minutes', 1) THEN
    PERFORM public._raise_quota_exceeded(_m.tenant_id, 'meeting_participant_minutes', 1);
  END IF;

  IF _m.conference_provider IS NULL OR _m.conference_ref IS NULL THEN
    UPDATE public.meetings
       SET conference_provider = COALESCE(conference_provider, 'livekit'),
           conference_ref = COALESCE(conference_ref, jsonb_build_object(
             'provider', 'livekit', 'roomName', 'mtg_' || _meeting_id::text, 'region', NULL)),
           updated_at = now()
     WHERE id = _meeting_id
     RETURNING * INTO _m;
  END IF;

  INSERT INTO public.meeting_join_tokens(
    tenant_id, meeting_id, user_id, role, token_fingerprint, expires_at, correlation_id, idempotency_key)
  VALUES (_m.tenant_id, _meeting_id, _actor, _role, _token_fingerprint, _expires_at, _correlation_id, _idempotency_key);

  PERFORM public._emit_outbox_event(_m.tenant_id, 'meeting.join_token.issued', 'meeting', _meeting_id::text,
    jsonb_build_object('meeting_id', _meeting_id, 'user_id', _actor, 'role', _role, 'expires_at', _expires_at),
    _idempotency_key, _correlation_id);

  RETURN jsonb_build_object(
    'meeting_id', _meeting_id,
    'tenant_id', _m.tenant_id,
    'room_name', COALESCE(_m.conference_ref->>'roomName', 'mtg_' || _meeting_id::text),
    'provider', COALESCE(_m.conference_provider, 'livekit'),
    'role', _role,
    'expires_at', _expires_at
  );
END;
$$;