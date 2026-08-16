CREATE INDEX IF NOT EXISTS idx_meeting_recordings_egress ON public.meeting_recordings(egress_id) WHERE egress_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.attach_meeting_recording_egress(_recording_id uuid, _egress_id text)
RETURNS public.meeting_recordings
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _r public.meeting_recordings;
BEGIN
  UPDATE public.meeting_recordings
     SET egress_id = _egress_id, status = 'recording'
   WHERE id = _recording_id
  RETURNING * INTO _r;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_RECORDING_NOT_FOUND' USING ERRCODE='02000'; END IF;
  RETURN _r;
END $$;

CREATE OR REPLACE FUNCTION public.fail_meeting_recording(_recording_id uuid, _error text)
RETURNS public.meeting_recordings
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _r public.meeting_recordings;
BEGIN
  UPDATE public.meeting_recordings
     SET status = 'failed', ended_at = COALESCE(ended_at, now()), error_message = left(COALESCE(_error,'unknown'), 500)
   WHERE id = _recording_id AND status IN ('starting','recording')
  RETURNING * INTO _r;
  IF NOT FOUND THEN
    SELECT * INTO _r FROM public.meeting_recordings WHERE id = _recording_id;
  END IF;
  RETURN _r;
END $$;

CREATE OR REPLACE FUNCTION public.finalize_meeting_recording_from_egress(
  _egress_id text, _status text, _file_url text DEFAULT NULL,
  _file_size_bytes bigint DEFAULT NULL, _duration_seconds bigint DEFAULT NULL, _error text DEFAULT NULL)
RETURNS public.meeting_recordings
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _r public.meeting_recordings;
BEGIN
  SELECT * INTO _r FROM public.meeting_recordings WHERE egress_id = _egress_id LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.meeting_recordings
     SET status = CASE WHEN _status = 'failed' THEN 'failed' ELSE 'completed' END,
         ended_at = COALESCE(ended_at, now()),
         file_url = COALESCE(_file_url, file_url),
         file_size_bytes = COALESCE(_file_size_bytes, file_size_bytes),
         duration_seconds = GREATEST(duration_seconds, COALESCE(_duration_seconds, 0)),
         error_message = COALESCE(left(_error, 500), error_message)
   WHERE id = _r.id
  RETURNING * INTO _r;

  PERFORM public._emit_outbox_event(_r.tenant_id, 'meeting.recording.file_ready', 'meeting', _r.meeting_id::text,
    jsonb_build_object('meeting_id', _r.meeting_id, 'recording_id', _r.id, 'status', _r.status,
                       'file_url', _r.file_url, 'duration_seconds', _r.duration_seconds),
    'egress:' || _egress_id, 'livekit:egress:' || _egress_id);
  RETURN _r;
END $$;

REVOKE EXECUTE ON FUNCTION public.attach_meeting_recording_egress(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_meeting_recording(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_meeting_recording_from_egress(text, text, text, bigint, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_meeting_recording_egress(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_meeting_recording(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_meeting_recording_from_egress(text, text, text, bigint, bigint, text) TO service_role;