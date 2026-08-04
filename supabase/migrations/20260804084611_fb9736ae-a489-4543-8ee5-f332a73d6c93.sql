
CREATE TABLE IF NOT EXISTS public.meeting_provider_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  meeting_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'livekit',
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  room_sid TEXT,
  participant_identity TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id TEXT,
  occurred_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS meeting_provider_events_uniq
  ON public.meeting_provider_events (provider, event_id);
CREATE INDEX IF NOT EXISTS meeting_provider_events_meeting_idx
  ON public.meeting_provider_events (meeting_id, created_at DESC);

GRANT SELECT ON public.meeting_provider_events TO authenticated;
GRANT ALL ON public.meeting_provider_events TO service_role;
ALTER TABLE public.meeting_provider_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mpe_select_tenant ON public.meeting_provider_events;
CREATE POLICY mpe_select_tenant ON public.meeting_provider_events
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

CREATE OR REPLACE FUNCTION public.ingest_meeting_provider_event(
  _meeting_id UUID,
  _event_id TEXT,
  _event_type TEXT,
  _room_sid TEXT DEFAULT NULL,
  _participant_identity TEXT DEFAULT NULL,
  _duration_seconds BIGINT DEFAULT 0,
  _occurred_at TIMESTAMPTZ DEFAULT now(),
  _payload JSONB DEFAULT '{}'::jsonb,
  _correlation_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _m public.meetings;
  _inserted BOOLEAN := FALSE;
  _key TEXT := 'livekit:' || _event_id;
  _live INT;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'MEETING_NOT_FOUND');
  END IF;

  INSERT INTO public.meeting_provider_events (
    tenant_id, meeting_id, provider, event_id, event_type, room_sid,
    participant_identity, payload, correlation_id, occurred_at
  ) VALUES (
    _m.tenant_id, _meeting_id, 'livekit', _event_id, _event_type, _room_sid,
    _participant_identity, COALESCE(_payload, '{}'::jsonb), _correlation_id, _occurred_at
  )
  ON CONFLICT (provider, event_id) DO NOTHING;
  GET DIAGNOSTICS _inserted = ROW_COUNT;

  IF NOT _inserted THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'applied', false);
  END IF;

  IF _event_type = 'room_started' THEN
    IF _m.status = 'scheduled' THEN
      UPDATE public.meetings
         SET status = 'live', updated_at = now(),
             conference_ref = COALESCE(conference_ref, '{}'::jsonb)
               || jsonb_build_object('roomSid', _room_sid, 'liveParticipants', 0)
       WHERE id = _meeting_id;
      PERFORM public._emit_outbox_event(_m.tenant_id, 'meeting.meeting.started', 'meeting',
        _meeting_id::text, jsonb_build_object('meeting_id', _meeting_id, 'source', 'provider'),
        _key, _correlation_id);
    END IF;

  ELSIF _event_type = 'participant_joined' THEN
    UPDATE public.meetings
       SET conference_ref = COALESCE(conference_ref, '{}'::jsonb)
             || jsonb_build_object('liveParticipants',
                  GREATEST(COALESCE((conference_ref->>'liveParticipants')::int, 0) + 1, 0)),
           updated_at = now()
     WHERE id = _meeting_id;
    PERFORM public._emit_outbox_event(_m.tenant_id, 'meeting.participant.joined', 'meeting',
      _meeting_id::text,
      jsonb_build_object('meeting_id', _meeting_id, 'identity', _participant_identity),
      _key, _correlation_id);

  ELSIF _event_type = 'participant_left' THEN
    UPDATE public.meetings
       SET conference_ref = COALESCE(conference_ref, '{}'::jsonb)
             || jsonb_build_object('liveParticipants',
                  GREATEST(COALESCE((conference_ref->>'liveParticipants')::int, 0) - 1, 0)),
           updated_at = now()
     WHERE id = _meeting_id;
    PERFORM public._emit_outbox_event(_m.tenant_id, 'meeting.participant.left', 'meeting',
      _meeting_id::text,
      jsonb_build_object('meeting_id', _meeting_id, 'identity', _participant_identity),
      _key, _correlation_id);

  ELSIF _event_type = 'room_finished' THEN
    IF COALESCE(_duration_seconds, 0) > 0 THEN
      PERFORM public.record_meeting_usage(_meeting_id, CEIL(_duration_seconds::numeric / 60)::bigint,
        _key, _correlation_id);
    END IF;
    UPDATE public.meetings
       SET conference_ref = COALESCE(conference_ref, '{}'::jsonb)
             || jsonb_build_object('liveParticipants', 0)
     WHERE id = _meeting_id;
    PERFORM public.finalize_meeting_from_provider(_meeting_id, _key, _correlation_id);
  END IF;

  SELECT COALESCE((conference_ref->>'liveParticipants')::int, 0) INTO _live
    FROM public.meetings WHERE id = _meeting_id;

  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'applied', true,
    'event_type', _event_type, 'live_participants', _live);
END $$;

REVOKE ALL ON FUNCTION public.ingest_meeting_provider_event(uuid, text, text, text, text, bigint, timestamptz, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_meeting_provider_event(uuid, text, text, text, text, bigint, timestamptz, jsonb, text) TO service_role;
