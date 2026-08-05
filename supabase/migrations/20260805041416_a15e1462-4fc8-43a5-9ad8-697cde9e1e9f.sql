ALTER TABLE public.meeting_provider_events
  ADD COLUMN IF NOT EXISTS duplicate_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_duplicate_at timestamp with time zone;

DO $mig$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE proname = 'ingest_meeting_provider_event' LIMIT 1;
  d := replace(
    d,
    'IF NOT _inserted THEN',
    'IF NOT _inserted THEN
    UPDATE public.meeting_provider_events
       SET duplicate_count = duplicate_count + 1, last_duplicate_at = now()
     WHERE provider = ''livekit'' AND event_id = _event_id;'
  );
  EXECUTE d;
END
$mig$;