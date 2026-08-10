-- ============ meeting_recordings ============
CREATE TABLE IF NOT EXISTS public.meeting_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'livekit',
  egress_id text,
  status text NOT NULL DEFAULT 'recording',
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds bigint NOT NULL DEFAULT 0,
  file_url text,
  file_size_bytes bigint,
  error_message text,
  started_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_recordings_status_chk CHECK (status IN ('starting','recording','completed','failed'))
);
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_meeting ON public.meeting_recordings(meeting_id, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_recordings_active
  ON public.meeting_recordings(meeting_id) WHERE status IN ('starting','recording');

GRANT SELECT ON public.meeting_recordings TO authenticated;
GRANT ALL ON public.meeting_recordings TO service_role;
ALTER TABLE public.meeting_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meeting_recordings_select_tenant_member"
  ON public.meeting_recordings FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

-- ============ meeting_attendance ============
CREATE TABLE IF NOT EXISTS public.meeting_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  minutes bigint NOT NULL DEFAULT 0,
  usage_recorded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meeting_attendance_meeting ON public.meeting_attendance(meeting_id, joined_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_attendance_open
  ON public.meeting_attendance(meeting_id, user_id) WHERE left_at IS NULL;

GRANT SELECT ON public.meeting_attendance TO authenticated;
GRANT ALL ON public.meeting_attendance TO service_role;
ALTER TABLE public.meeting_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meeting_attendance_select_tenant_member"
  ON public.meeting_attendance FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE TRIGGER trg_meeting_recordings_updated_at
  BEFORE UPDATE ON public.meeting_recordings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_meeting_attendance_updated_at
  BEFORE UPDATE ON public.meeting_attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ helpers ============
CREATE OR REPLACE FUNCTION public._meeting_host_guard(_meeting_id uuid)
RETURNS public.meetings
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _actor uuid := auth.uid(); _m public.meetings; _role text;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;
  IF NOT public.is_tenant_member(_m.tenant_id) THEN RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  SELECT mp.role INTO _role FROM public.meeting_participants mp
    WHERE mp.meeting_id = _meeting_id AND mp.user_id = _actor;
  IF _role IS NULL OR _role NOT IN ('host','moderator') THEN
    RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  RETURN _m;
END $$;

-- ============ recording lifecycle ============
CREATE OR REPLACE FUNCTION public.start_meeting_recording(
  _meeting_id uuid, _idempotency_key text DEFAULT NULL, _correlation_id text DEFAULT NULL)
RETURNS public.meeting_recordings
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _m public.meetings; _r public.meeting_recordings;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  _m := public._meeting_host_guard(_meeting_id);
  IF _m.status = 'canceled' THEN RAISE EXCEPTION 'MEETING_NOT_JOINABLE' USING ERRCODE='22000'; END IF;

  SELECT * INTO _r FROM public.meeting_recordings
   WHERE meeting_id = _meeting_id AND status IN ('starting','recording') LIMIT 1;
  IF FOUND THEN RETURN _r; END IF;

  INSERT INTO public.meeting_recordings(tenant_id, meeting_id, provider, status, started_by)
  VALUES (_m.tenant_id, _meeting_id, COALESCE(_m.conference_provider,'livekit'), 'recording', auth.uid())
  RETURNING * INTO _r;

  PERFORM public._emit_outbox_event(_m.tenant_id, 'meeting.recording.started', 'meeting', _meeting_id::text,
    jsonb_build_object('meeting_id', _meeting_id, 'recording_id', _r.id), _idempotency_key, _correlation_id);
  RETURN _r;
END $$;

CREATE OR REPLACE FUNCTION public.stop_meeting_recording(
  _meeting_id uuid, _file_url text DEFAULT NULL, _file_size_bytes bigint DEFAULT NULL,
  _idempotency_key text DEFAULT NULL, _correlation_id text DEFAULT NULL)
RETURNS public.meeting_recordings
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _m public.meetings; _r public.meeting_recordings;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  _m := public._meeting_host_guard(_meeting_id);

  SELECT * INTO _r FROM public.meeting_recordings
   WHERE meeting_id = _meeting_id AND status IN ('starting','recording') LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO _r FROM public.meeting_recordings
     WHERE meeting_id = _meeting_id ORDER BY started_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_RECORDING_NOT_FOUND' USING ERRCODE='02000'; END IF;
    RETURN _r;
  END IF;

  UPDATE public.meeting_recordings
     SET status = 'completed', ended_at = now(),
         duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (now() - started_at))::bigint),
         file_url = COALESCE(_file_url, file_url),
         file_size_bytes = COALESCE(_file_size_bytes, file_size_bytes)
   WHERE id = _r.id RETURNING * INTO _r;

  PERFORM public.record_usage(_m.tenant_id, 'meeting.recording.minutes',
    GREATEST(1, CEIL(_r.duration_seconds::numeric / 60)::bigint),
    COALESCE(_idempotency_key, _r.id::text) || ':rec', _correlation_id, _m.workspace_id,
    jsonb_build_object('meeting_id', _meeting_id, 'recording_id', _r.id));

  PERFORM public._emit_outbox_event(_m.tenant_id, 'meeting.recording.completed', 'meeting', _meeting_id::text,
    jsonb_build_object('meeting_id', _meeting_id, 'recording_id', _r.id, 'duration_seconds', _r.duration_seconds),
    _idempotency_key, _correlation_id);
  RETURN _r;
END $$;

-- ============ attendance / usage minutes ============
CREATE OR REPLACE FUNCTION public.open_meeting_attendance(
  _meeting_id uuid, _correlation_id text DEFAULT NULL)
RETURNS public.meeting_attendance
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _actor uuid := auth.uid(); _m public.meetings; _a public.meeting_attendance;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;
  IF NOT public.is_tenant_member(_m.tenant_id) THEN RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

  SELECT * INTO _a FROM public.meeting_attendance
   WHERE meeting_id = _meeting_id AND user_id = _actor AND left_at IS NULL LIMIT 1;
  IF FOUND THEN RETURN _a; END IF;

  INSERT INTO public.meeting_attendance(tenant_id, meeting_id, user_id)
  VALUES (_m.tenant_id, _meeting_id, _actor)
  RETURNING * INTO _a;
  RETURN _a;
END $$;

CREATE OR REPLACE FUNCTION public.close_meeting_attendance(
  _meeting_id uuid, _correlation_id text DEFAULT NULL)
RETURNS public.meeting_attendance
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _actor uuid := auth.uid(); _a public.meeting_attendance; _mins bigint;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT * INTO _a FROM public.meeting_attendance
   WHERE meeting_id = _meeting_id AND user_id = _actor AND left_at IS NULL LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  _mins := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (now() - _a.joined_at))::numeric / 60)::bigint);
  UPDATE public.meeting_attendance
     SET left_at = now(), minutes = _mins, usage_recorded = true
   WHERE id = _a.id RETURNING * INTO _a;

  PERFORM public.record_meeting_usage(_meeting_id, _mins, _a.id::text, _correlation_id);
  RETURN _a;
END $$;

CREATE OR REPLACE FUNCTION public.get_meeting_stats(_meeting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _m public.meetings; _res jsonb;
BEGIN
  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;
  IF NOT public.is_tenant_member(_m.tenant_id) THEN RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

  SELECT jsonb_build_object(
    'meeting_id', _meeting_id,
    'status', _m.status,
    'total_participant_minutes', COALESCE((SELECT SUM(minutes) FROM public.meeting_attendance WHERE meeting_id = _meeting_id), 0),
    'unique_participants', COALESCE((SELECT COUNT(DISTINCT user_id) FROM public.meeting_attendance WHERE meeting_id = _meeting_id), 0),
    'active_participants', COALESCE((SELECT COUNT(*) FROM public.meeting_attendance WHERE meeting_id = _meeting_id AND left_at IS NULL), 0),
    'recording_count', COALESCE((SELECT COUNT(*) FROM public.meeting_recordings WHERE meeting_id = _meeting_id), 0),
    'recording_seconds', COALESCE((SELECT SUM(duration_seconds) FROM public.meeting_recordings WHERE meeting_id = _meeting_id), 0),
    'is_recording', EXISTS(SELECT 1 FROM public.meeting_recordings WHERE meeting_id = _meeting_id AND status IN ('starting','recording')),
    'attendance', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'user_id', a.user_id, 'joined_at', a.joined_at,
        'left_at', a.left_at, 'minutes', a.minutes) ORDER BY a.joined_at DESC)
      FROM public.meeting_attendance a WHERE a.meeting_id = _meeting_id), '[]'::jsonb),
    'recordings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'status', r.status, 'provider', r.provider,
        'started_at', r.started_at, 'ended_at', r.ended_at,
        'duration_seconds', r.duration_seconds, 'file_url', r.file_url,
        'file_size_bytes', r.file_size_bytes, 'error_message', r.error_message) ORDER BY r.started_at DESC)
      FROM public.meeting_recordings r WHERE r.meeting_id = _meeting_id), '[]'::jsonb)
  ) INTO _res;
  RETURN _res;
END $$;

-- ============ auto close on meeting end ============
CREATE OR REPLACE FUNCTION public.tg_meetings_close_sessions()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _a record; _mins bigint;
BEGIN
  IF NEW.status = 'ended' AND OLD.status IS DISTINCT FROM 'ended' THEN
    FOR _a IN SELECT * FROM public.meeting_attendance WHERE meeting_id = NEW.id AND left_at IS NULL LOOP
      _mins := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (now() - _a.joined_at))::numeric / 60)::bigint);
      UPDATE public.meeting_attendance
         SET left_at = now(), minutes = _mins, usage_recorded = true WHERE id = _a.id;
      PERFORM public.record_meeting_usage(NEW.id, _mins, _a.id::text, NULL);
    END LOOP;

    UPDATE public.meeting_recordings
       SET status = 'completed', ended_at = now(),
           duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (now() - started_at))::bigint)
     WHERE meeting_id = NEW.id AND status IN ('starting','recording');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_meetings_close_sessions ON public.meetings;
CREATE TRIGGER trg_meetings_close_sessions
  AFTER UPDATE OF status ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.tg_meetings_close_sessions();

REVOKE ALL ON FUNCTION public._meeting_host_guard(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_meeting_recording(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stop_meeting_recording(uuid, text, bigint, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_meeting_attendance(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_meeting_attendance(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_meeting_stats(uuid) TO authenticated;