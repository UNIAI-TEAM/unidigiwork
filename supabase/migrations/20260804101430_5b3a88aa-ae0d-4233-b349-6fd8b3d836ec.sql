CREATE OR REPLACE FUNCTION public.issue_meeting_join_token(_meeting_id uuid, _token_fingerprint text, _expires_at timestamp with time zone, _idempotency_key text DEFAULT NULL::text, _correlation_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor UUID := auth.uid();
  _m public.meetings;
  _role TEXT;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;

  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;
  IF NOT public.is_tenant_member(_m.tenant_id) THEN
    RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  SELECT mp.role INTO _role FROM public.meeting_participants mp
   WHERE mp.meeting_id = _meeting_id AND mp.user_id = _actor;

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
    'status', _m.status
  );
END $function$;