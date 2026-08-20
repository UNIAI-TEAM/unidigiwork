CREATE OR REPLACE FUNCTION public.cancel_meeting(_meeting_id uuid, _reason text DEFAULT NULL::text, _expected_row_version bigint DEFAULT NULL::bigint, _idempotency_key text DEFAULT NULL::text, _correlation_id text DEFAULT NULL::text)
RETURNS public.meetings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _actor uuid := auth.uid(); _m public.meetings; _reason_text text;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF _m.id IS NULL THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_m.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF _expected_row_version IS NOT NULL AND _m.row_version <> _expected_row_version THEN
    RAISE EXCEPTION 'MEETING_VERSION_CONFLICT' USING ERRCODE='40001';
  END IF;
  UPDATE public.meetings SET status = 'canceled', deleted_at = now(), updated_by = _actor
  WHERE id = _meeting_id RETURNING * INTO _m;

  _reason_text := NULLIF(btrim(COALESCE(_reason, '')), '');

  INSERT INTO public.notifications(user_id, workspace_id, tenant_id, scope_type, type, title, body, link, meta)
  SELECT DISTINCT mp.user_id, _m.workspace_id, _m.tenant_id, 'tenant', 'meeting',
         'Buổi họp đã bị hủy: ' || COALESCE(_m.title, ''),
         CASE WHEN _reason_text IS NULL THEN 'Buổi họp đã bị hủy.'
              ELSE 'Lý do hủy: ' || _reason_text END,
         '/meeting/' || _m.id::text,
         jsonb_build_object('meeting_id', _m.id, 'reason', _reason_text, 'event', 'meeting.canceled')
    FROM public.meeting_participants mp
   WHERE mp.meeting_id = _m.id
     AND mp.user_id IS NOT NULL
     AND mp.user_id <> _actor;

  PERFORM public._emit_outbox_event(_m.tenant_id, 'meeting.meeting.canceled', 'meeting', _m.id::text,
    jsonb_build_object('meeting_id', _m.id, 'reason', _reason, 'actor_id', _actor),
    _idempotency_key, _correlation_id);
  RETURN _m;
END $$;