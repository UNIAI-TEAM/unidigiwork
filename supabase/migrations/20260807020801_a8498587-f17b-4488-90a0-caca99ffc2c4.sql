CREATE OR REPLACE FUNCTION public.report_overview(_days integer DEFAULT 30, _workspace_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  d integer := GREATEST(1, LEAST(COALESCE(_days, 30), 365));
  cur_from timestamptz := now() - make_interval(days => d);
  prev_from timestamptz := now() - make_interval(days => d * 2);
  result jsonb;
BEGIN
  WITH ws AS (
    SELECT w.id, w.name
    FROM public.workspaces w
    WHERE w.deleted_at IS NULL
      AND (_workspace_id IS NULL OR w.id = _workspace_id)
  ),
  tk AS (
    SELECT t.* FROM public.tasks t
    WHERE t.deleted_at IS NULL AND t.workspace_id IN (SELECT id FROM ws)
  ),
  mt AS (
    SELECT m.* FROM public.meetings m
    WHERE m.deleted_at IS NULL AND m.workspace_id IN (SELECT id FROM ws)
  ),
  dc AS (
    SELECT doc.* FROM public.documents doc
    WHERE doc.deleted_at IS NULL AND doc.workspace_id IN (SELECT id FROM ws)
  ),
  wm AS (
    SELECT DISTINCT m.workspace_id, m.user_id
    FROM public.workspace_members m
    WHERE m.workspace_id IN (SELECT id FROM ws)
  ),
  kpi AS (
    SELECT
      (SELECT count(DISTINCT user_id) FROM wm) AS users,
      (SELECT count(DISTINCT user_id) FROM wm w2
        WHERE EXISTS (SELECT 1 FROM tk WHERE tk.created_by = w2.user_id AND tk.created_at >= cur_from)
           OR EXISTS (SELECT 1 FROM mt WHERE mt.created_by = w2.user_id AND mt.created_at >= cur_from)
           OR EXISTS (SELECT 1 FROM dc WHERE dc.created_by = w2.user_id AND dc.created_at >= cur_from)
      ) AS active_users,
      (SELECT count(*) FROM ws) AS workspaces,
      (SELECT count(*) FROM tk) AS tasks,
      (SELECT count(*) FROM mt) AS meetings,
      (SELECT count(*) FROM dc) AS documents,
      (SELECT count(*) FROM tk WHERE created_at >= cur_from) AS tasks_cur,
      (SELECT count(*) FROM tk WHERE created_at >= prev_from AND created_at < cur_from) AS tasks_prev,
      (SELECT count(*) FROM mt WHERE created_at >= cur_from) AS meetings_cur,
      (SELECT count(*) FROM mt WHERE created_at >= prev_from AND created_at < cur_from) AS meetings_prev,
      (SELECT count(*) FROM dc WHERE created_at >= cur_from) AS docs_cur,
      (SELECT count(*) FROM dc WHERE created_at >= prev_from AND created_at < cur_from) AS docs_prev,
      (SELECT count(*) FROM ws w3 WHERE EXISTS (SELECT 1 FROM public.workspaces w4 WHERE w4.id = w3.id AND w4.created_at >= cur_from)) AS ws_cur,
      (SELECT count(*) FROM ws w3 WHERE EXISTS (SELECT 1 FROM public.workspaces w4 WHERE w4.id = w3.id AND w4.created_at >= prev_from AND w4.created_at < cur_from)) AS ws_prev
  ),
  status AS (
    SELECT
      count(*) FILTER (WHERE status = 'done') AS done,
      count(*) FILTER (WHERE status = 'in_progress') AS in_progress,
      count(*) FILTER (WHERE status = 'todo') AS todo,
      count(*) FILTER (WHERE status = 'blocked') AS blocked,
      count(*) FILTER (WHERE status = 'canceled') AS canceled,
      count(*) AS total
    FROM tk
  ),
  proj AS (
    SELECT
      ws.id,
      ws.name,
      (SELECT count(*) FROM tk WHERE tk.workspace_id = ws.id) AS tasks,
      (SELECT count(*) FROM tk WHERE tk.workspace_id = ws.id AND tk.status = 'done') AS done,
      (SELECT count(*) FROM tk WHERE tk.workspace_id = ws.id AND tk.status = 'blocked') AS blocked,
      (SELECT count(*) FROM tk WHERE tk.workspace_id = ws.id AND tk.status <> 'done' AND tk.status <> 'canceled' AND tk.due_at IS NOT NULL AND tk.due_at < now()) AS overdue,
      (SELECT count(*) FROM wm WHERE wm.workspace_id = ws.id) AS members
    FROM ws
  ),
  series AS (
    SELECT gs::date AS day,
      (SELECT count(*) FROM tk WHERE tk.created_at::date = gs::date) AS tasks,
      (SELECT count(*) FROM mt WHERE mt.start_at::date = gs::date) AS meetings,
      (SELECT count(*) FROM dc WHERE dc.created_at::date = gs::date) AS documents,
      (SELECT count(*) FROM tk WHERE tk.completed_at::date = gs::date) AS completed
    FROM generate_series(cur_from::date, now()::date, interval '1 day') gs
  )
  SELECT jsonb_build_object(
    'range_days', d,
    'from', cur_from,
    'kpis', (SELECT to_jsonb(kpi) FROM kpi),
    'tasks_by_status', (SELECT to_jsonb(status) FROM status),
    'workspaces', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'tasks')::int DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', p.id, 'name', p.name, 'tasks', p.tasks, 'members', p.members,
          'progress', CASE WHEN p.tasks = 0 THEN 0 ELSE round(p.done * 100.0 / p.tasks) END,
          'status', CASE
            WHEN p.tasks = 0 THEN 'not_started'
            WHEN p.overdue > 0 OR p.blocked > 0 THEN 'risk'
            ELSE 'ontrack' END
        ) AS x FROM proj p
      ) s
    ), '[]'::jsonb),
    'activity', COALESCE((SELECT jsonb_agg(to_jsonb(series) ORDER BY series.day) FROM series), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_overview(integer, uuid) TO authenticated;