CREATE OR REPLACE FUNCTION public.get_workspace_meeting_stats(_workspace_id uuid)
RETURNS TABLE(today_count integer, live_count integer, recording_count integer, summary_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = _workspace_id AND wm.user_id = _uid
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  RETURN QUERY
  WITH ms AS (
    SELECT m.id, m.start_at, m.status
    FROM public.meetings m
    WHERE m.workspace_id = _workspace_id
  )
  SELECT
    (SELECT count(*)::int FROM ms WHERE ms.start_at >= date_trunc('day', now()) AND ms.start_at < date_trunc('day', now()) + interval '1 day'),
    (SELECT count(*)::int FROM ms WHERE ms.status = 'live'),
    (SELECT count(*)::int FROM public.meeting_recordings r WHERE r.meeting_id IN (SELECT id FROM ms) AND r.created_at >= now() - interval '7 days'),
    (SELECT count(*)::int FROM public.meeting_summaries s WHERE s.meeting_id IN (SELECT id FROM ms) AND s.created_at >= date_trunc('month', now()));
END;
$$;

REVOKE ALL ON FUNCTION public.get_workspace_meeting_stats(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_workspace_meeting_stats(uuid) TO authenticated;