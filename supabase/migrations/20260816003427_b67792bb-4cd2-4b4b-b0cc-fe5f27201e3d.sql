CREATE OR REPLACE FUNCTION public.get_dashboard_ai_summary(
  _workspace_id uuid DEFAULT NULL,
  _day_start timestamptz DEFAULT date_trunc('day', now()),
  _day_end timestamptz DEFAULT date_trunc('day', now()) + interval '1 day'
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'stale_documents', (
      SELECT count(*) FROM public.documents d
      WHERE d.deleted_at IS NULL
        AND d.updated_at < now() - interval '30 days'
        AND (_workspace_id IS NULL OR d.workspace_id = _workspace_id)
    ),
    'overdue_tasks', (
      SELECT count(*) FROM public.tasks t
      WHERE t.deleted_at IS NULL
        AND t.due_at IS NOT NULL
        AND t.due_at < now()
        AND t.status NOT IN ('done','canceled')
        AND (_workspace_id IS NULL OR t.workspace_id = _workspace_id)
    ),
    'meetings_today', (
      SELECT count(*) FROM public.meetings m
      WHERE m.deleted_at IS NULL
        AND m.start_at >= _day_start
        AND m.start_at < _day_end
        AND (_workspace_id IS NULL OR m.workspace_id = _workspace_id)
    ),
    'pending_workflow_approvals', (
      SELECT count(*) FROM public.workflow_access_requests r
      WHERE r.status = 'pending'
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_ai_summary(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_ai_summary(uuid, timestamptz, timestamptz) TO service_role;