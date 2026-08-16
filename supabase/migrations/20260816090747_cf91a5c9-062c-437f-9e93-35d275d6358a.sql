CREATE TABLE IF NOT EXISTS public.meeting_summary_progress (
  meeting_id uuid PRIMARY KEY REFERENCES public.meetings(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  phase text NOT NULL DEFAULT 'PREPARING',
  staged boolean NOT NULL DEFAULT false,
  truncated boolean NOT NULL DEFAULT false,
  total_chunks integer NOT NULL DEFAULT 0,
  completed_chunks integer NOT NULL DEFAULT 0,
  failed_chunks integer NOT NULL DEFAULT 0,
  chunks jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT meeting_summary_progress_phase_chk
    CHECK (phase IN ('PREPARING','MAPPING','SYNTHESIS','DONE','FAILED'))
);

GRANT SELECT ON public.meeting_summary_progress TO authenticated;
GRANT ALL ON public.meeting_summary_progress TO service_role;
ALTER TABLE public.meeting_summary_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meeting_summary_progress_select_tenant_member" ON public.meeting_summary_progress;
CREATE POLICY "meeting_summary_progress_select_tenant_member"
  ON public.meeting_summary_progress FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE OR REPLACE FUNCTION public.save_meeting_summary_progress(
  _meeting_id uuid,
  _run_id uuid,
  _phase text,
  _staged boolean,
  _truncated boolean,
  _chunks jsonb
)
RETURNS public.meeting_summary_progress
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _actor uuid := auth.uid();
  _m public.meetings;
  _row public.meeting_summary_progress;
  _total integer;
  _done integer;
  _failed integer;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  IF _phase NOT IN ('PREPARING','MAPPING','SYNTHESIS','DONE','FAILED') THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: phase' USING ERRCODE='22000';
  END IF;

  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;
  IF NOT public.is_tenant_member(_m.tenant_id) THEN
    RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  _chunks := coalesce(_chunks, '[]'::jsonb);
  SELECT count(*)::int INTO _total FROM jsonb_array_elements(_chunks);
  SELECT count(*)::int INTO _done FROM jsonb_array_elements(_chunks) c WHERE c->>'status' = 'DONE';
  SELECT count(*)::int INTO _failed FROM jsonb_array_elements(_chunks) c WHERE c->>'status' = 'FAILED';

  INSERT INTO public.meeting_summary_progress AS p
    (meeting_id, tenant_id, run_id, phase, staged, truncated,
     total_chunks, completed_chunks, failed_chunks, chunks, started_at, updated_at, finished_at)
  VALUES
    (_meeting_id, _m.tenant_id, _run_id, _phase, coalesce(_staged,false), coalesce(_truncated,false),
     _total, _done, _failed, _chunks, now(), now(),
     CASE WHEN _phase IN ('DONE','FAILED') THEN now() ELSE NULL END)
  ON CONFLICT (meeting_id) DO UPDATE SET
    run_id = EXCLUDED.run_id,
    phase = EXCLUDED.phase,
    staged = EXCLUDED.staged,
    truncated = EXCLUDED.truncated,
    total_chunks = EXCLUDED.total_chunks,
    completed_chunks = EXCLUDED.completed_chunks,
    failed_chunks = EXCLUDED.failed_chunks,
    chunks = EXCLUDED.chunks,
    started_at = CASE WHEN p.run_id IS DISTINCT FROM EXCLUDED.run_id THEN now() ELSE p.started_at END,
    updated_at = now(),
    finished_at = CASE WHEN EXCLUDED.phase IN ('DONE','FAILED') THEN now() ELSE NULL END
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_meeting_summary_progress(uuid, uuid, text, boolean, boolean, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.save_meeting_summary_progress(uuid, uuid, text, boolean, boolean, jsonb) TO authenticated;