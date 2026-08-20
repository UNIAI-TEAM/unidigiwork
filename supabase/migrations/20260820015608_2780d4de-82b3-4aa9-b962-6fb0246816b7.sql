CREATE OR REPLACE FUNCTION public.remove_meeting_participant(_meeting_id uuid, _user_id uuid, _correlation_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _m public.meetings;
  _target_role text;
  _host_count int;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;

  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;

  IF NOT public.can_manage_meeting_access(_meeting_id, _actor) THEN
    RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  SELECT mp.role INTO _target_role FROM public.meeting_participants mp
   WHERE mp.meeting_id = _meeting_id AND mp.user_id = _user_id;
  IF _target_role IS NULL THEN
    RETURN jsonb_build_object('status','not_found');
  END IF;

  IF _target_role IN ('host','organizer') THEN
    SELECT count(*) INTO _host_count FROM public.meeting_participants mp
     WHERE mp.meeting_id = _meeting_id AND mp.role IN ('host','organizer');
    IF _host_count <= 1 THEN
      RAISE EXCEPTION 'MEETING_LAST_HOST' USING ERRCODE='23514';
    END IF;
  END IF;

  DELETE FROM public.meeting_participants
   WHERE meeting_id = _meeting_id AND user_id = _user_id;

  RETURN jsonb_build_object('status','removed','user_id',_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.remove_meeting_participant(uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.remove_meeting_participant(uuid, uuid, text) TO authenticated;