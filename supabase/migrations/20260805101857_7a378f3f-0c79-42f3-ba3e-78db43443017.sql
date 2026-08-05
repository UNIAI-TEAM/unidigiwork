CREATE OR REPLACE FUNCTION public.invite_meeting_participant(
  _meeting_id uuid,
  _email text,
  _correlation_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _m public.meetings;
  _role text;
  _target uuid;
  _norm text := lower(trim(_email));
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;

  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;

  SELECT mp.role INTO _role FROM public.meeting_participants mp
   WHERE mp.meeting_id = _meeting_id AND mp.user_id = _actor;

  IF COALESCE(_role,'') NOT IN ('host','cohost')
     AND NOT public.has_tenant_role(_m.tenant_id, 'tenant_admin')
     AND NOT public.has_tenant_role(_m.tenant_id, 'tenant_owner') THEN
    RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  SELECT u.id INTO _target FROM public.users u
   WHERE lower(u.primary_email) = _norm
   LIMIT 1;

  IF _target IS NULL THEN
    RETURN jsonb_build_object('email', _norm, 'status', 'not_found');
  END IF;

  IF EXISTS (SELECT 1 FROM public.meeting_participants mp
              WHERE mp.meeting_id = _meeting_id AND mp.user_id = _target) THEN
    RETURN jsonb_build_object('email', _norm, 'status', 'already');
  END IF;

  INSERT INTO public.meeting_participants(meeting_id, user_id, tenant_id, role, rsvp)
  VALUES (_meeting_id, _target, _m.tenant_id, 'participant', 'pending')
  ON CONFLICT (meeting_id, user_id) DO NOTHING;

  INSERT INTO public.notifications(user_id, workspace_id, tenant_id, type, title, body, link, scope_type)
  VALUES (_target, _m.workspace_id, _m.tenant_id, 'meeting',
          'Bạn được mời họp: ' || _m.title,
          'Bấm để vào phòng họp.', '/meeting/' || _m.id::text, 'tenant');

  RETURN jsonb_build_object('email', _norm, 'status', 'invited', 'user_id', _target);
END;
$$;

REVOKE ALL ON FUNCTION public.invite_meeting_participant(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_meeting_participant(uuid, text, text) TO authenticated;