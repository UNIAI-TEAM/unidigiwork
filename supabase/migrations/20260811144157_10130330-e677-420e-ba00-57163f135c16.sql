CREATE OR REPLACE FUNCTION public.log_meeting_host_action(_meeting_id uuid, _action text, _outcome text, _error_code text DEFAULT NULL::text, _idempotency_key text DEFAULT NULL::text, _correlation_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _actor uuid := auth.uid(); _m public.meetings; _role text; _id uuid;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  IF _action NOT IN ('start','end','cancel') THEN RAISE EXCEPTION 'INVALID_ACTION' USING ERRCODE='22023'; END IF;
  IF _outcome NOT IN ('success','failure') THEN RAISE EXCEPTION 'INVALID_OUTCOME' USING ERRCODE='22023'; END IF;

  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;
  IF NOT public.is_tenant_member(_m.tenant_id) THEN RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

  SELECT mp.role INTO _role FROM public.meeting_participants mp
    WHERE mp.meeting_id = _meeting_id AND mp.user_id = _actor;

  INSERT INTO public.audit_events (
    tenant_id, actor_user_id, actor_id, action, event_type,
    resource_type, resource_id, aggregate_type, aggregate_id,
    after_state, payload, source, correlation_id, idempotency_key, occurred_at
  ) VALUES (
    _m.tenant_id, _actor, _actor,
    'meeting.host.' || _action || '.' || _outcome,
    'meeting.host.' || _action || '.' || _outcome,
    'meeting', _meeting_id::text, 'meeting', _meeting_id::text,
    jsonb_build_object('action', _action, 'outcome', _outcome, 'error_code', _error_code, 'actor_role', _role, 'meeting_status', _m.status),
    jsonb_build_object('action', _action, 'outcome', _outcome, 'error_code', _error_code, 'actor_role', _role, 'meeting_status', _m.status),
    'app', _correlation_id, _idempotency_key, now()
  ) RETURNING id INTO _id;

  RETURN _id;
END $function$;