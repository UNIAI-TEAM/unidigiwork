-- ============ meeting_transcript_segments ============
CREATE TABLE IF NOT EXISTS public.meeting_transcript_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  speaker_user_id uuid,
  speaker_name text,
  offset_seconds integer NOT NULL DEFAULT 0,
  content text NOT NULL,
  source text NOT NULL DEFAULT 'LIVE_CAPTION',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_transcript_source_chk CHECK (source IN ('LIVE_CAPTION','RECORDING','MANUAL')),
  CONSTRAINT meeting_transcript_content_chk CHECK (char_length(content) BETWEEN 1 AND 4000)
);
CREATE INDEX IF NOT EXISTS idx_meeting_transcript_meeting
  ON public.meeting_transcript_segments(meeting_id, offset_seconds, created_at);

GRANT SELECT ON public.meeting_transcript_segments TO authenticated;
GRANT ALL ON public.meeting_transcript_segments TO service_role;
ALTER TABLE public.meeting_transcript_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meeting_transcript_select_tenant_member"
  ON public.meeting_transcript_segments FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

-- ============ meeting_summaries ============
CREATE TABLE IF NOT EXISTS public.meeting_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ready',
  model text,
  summary text NOT NULL DEFAULT '',
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  decisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  action_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  segment_count integer NOT NULL DEFAULT 0,
  generated_by uuid,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_summaries_status_chk CHECK (status IN ('ready','partial','failed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_meeting_summaries_meeting
  ON public.meeting_summaries(meeting_id);

GRANT SELECT ON public.meeting_summaries TO authenticated;
GRANT ALL ON public.meeting_summaries TO service_role;
ALTER TABLE public.meeting_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meeting_summaries_select_tenant_member"
  ON public.meeting_summaries FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE TRIGGER trg_meeting_summaries_updated_at
  BEFORE UPDATE ON public.meeting_summaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ write RPCs ============
CREATE OR REPLACE FUNCTION public.append_meeting_transcript(
  _meeting_id uuid,
  _segments jsonb,
  _source text DEFAULT 'LIVE_CAPTION'
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _actor uuid := auth.uid();
  _m public.meetings;
  _is_participant boolean;
  _inserted integer := 0;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;
  IF NOT public.is_tenant_member(_m.tenant_id) THEN
    RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.meeting_participants mp
    WHERE mp.meeting_id = _meeting_id AND mp.user_id = _actor
  ) INTO _is_participant;
  IF NOT _is_participant AND _m.created_by IS DISTINCT FROM _actor THEN
    RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  IF _source NOT IN ('LIVE_CAPTION','RECORDING','MANUAL') THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: source' USING ERRCODE='22000';
  END IF;

  INSERT INTO public.meeting_transcript_segments
    (tenant_id, meeting_id, speaker_user_id, speaker_name, offset_seconds, content, source, created_by)
  SELECT
    _m.tenant_id,
    _meeting_id,
    _actor,
    NULLIF(left(coalesce(s->>'speakerName',''), 120), ''),
    greatest(0, coalesce((s->>'offsetSeconds')::int, 0)),
    left(s->>'content', 4000),
    _source,
    _actor
  FROM jsonb_array_elements(coalesce(_segments, '[]'::jsonb)) AS s
  WHERE coalesce(btrim(s->>'content'), '') <> '';
  GET DIAGNOSTICS _inserted = ROW_COUNT;
  RETURN _inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_meeting_summary(
  _meeting_id uuid,
  _status text,
  _model text,
  _summary text,
  _highlights jsonb,
  _decisions jsonb,
  _action_items jsonb,
  _sources jsonb,
  _segment_count integer
)
RETURNS public.meeting_summaries
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _m public.meetings; _row public.meeting_summaries;
BEGIN
  _m := public._meeting_host_guard(_meeting_id);
  IF _status NOT IN ('ready','partial','failed') THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: status' USING ERRCODE='22000';
  END IF;

  INSERT INTO public.meeting_summaries AS ms
    (tenant_id, meeting_id, status, model, summary, highlights, decisions, action_items, sources, segment_count, generated_by, generated_at)
  VALUES
    (_m.tenant_id, _meeting_id, _status, _model, coalesce(_summary,''),
     coalesce(_highlights,'[]'::jsonb), coalesce(_decisions,'[]'::jsonb), coalesce(_action_items,'[]'::jsonb),
     coalesce(_sources,'[]'::jsonb), greatest(0, coalesce(_segment_count,0)), auth.uid(), now())
  ON CONFLICT (meeting_id) DO UPDATE SET
    status = EXCLUDED.status,
    model = EXCLUDED.model,
    summary = EXCLUDED.summary,
    highlights = EXCLUDED.highlights,
    decisions = EXCLUDED.decisions,
    action_items = EXCLUDED.action_items,
    sources = EXCLUDED.sources,
    segment_count = EXCLUDED.segment_count,
    generated_by = EXCLUDED.generated_by,
    generated_at = EXCLUDED.generated_at
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.append_meeting_transcript(uuid, jsonb, text) FROM public;
REVOKE ALL ON FUNCTION public.save_meeting_summary(uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.append_meeting_transcript(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_meeting_summary(uuid, text, text, text, jsonb, jsonb, jsonb, jsonb, integer) TO authenticated;