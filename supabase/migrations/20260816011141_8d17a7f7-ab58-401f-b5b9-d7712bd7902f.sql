CREATE OR REPLACE FUNCTION public.get_home_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH me AS (SELECT auth.uid() AS uid),
bounds AS (
  SELECT date_trunc('day', now()) AS day_start,
         date_trunc('day', now()) + interval '1 day' AS day_end,
         date_trunc('day', now()) + interval '2 day' AS tomorrow_end
),
my_tasks AS (
  SELECT t.id, t.title, t.status::text AS status, t.priority::text AS priority,
         t.due_at, t.workspace_id, t.row_version,
         w.name AS workspace_name,
         CASE WHEN t.due_at IS NOT NULL AND t.due_at < now()
              THEN GREATEST(1, (EXTRACT(EPOCH FROM (now() - t.due_at)) / 86400)::int)
         END AS overdue_days
  FROM public.tasks t
  JOIN public.task_assignees a ON a.task_id = t.id AND a.user_id = (SELECT uid FROM me)
  LEFT JOIN public.workspaces w ON w.id = t.workspace_id
  WHERE t.deleted_at IS NULL AND t.status NOT IN ('done','canceled')
  LIMIT 100
),
my_meetings AS (
  SELECT m.id, m.title, m.start_at, m.end_at, m.status::text AS status,
         (SELECT count(*) FROM public.meeting_participants p2 WHERE p2.meeting_id = m.id) AS participants
  FROM public.meetings m
  JOIN public.meeting_participants p ON p.meeting_id = m.id AND p.user_id = (SELECT uid FROM me)
  WHERE m.deleted_at IS NULL
    AND m.start_at >= now() - interval '1 hour'
    AND m.start_at < (SELECT tomorrow_end FROM bounds)
  ORDER BY m.start_at
  LIMIT 5
),
my_notifs AS (
  SELECT n.id, n.type, n.title, n.body, n.link, n.is_read, n.created_at
  FROM public.notifications n
  WHERE n.user_id = (SELECT uid FROM me) AND n.is_read = false
  ORDER BY n.created_at DESC
  LIMIT 10
),
my_emails AS (
  SELECT s.message_id, s.is_starred, s.updated_at, em.subject, em.sent_at
  FROM public.email_states s
  JOIN public.email_messages em ON em.id = s.message_id
  WHERE s.user_id = (SELECT uid FROM me) AND s.folder = 'inbox' AND s.is_read = false
  ORDER BY s.updated_at DESC
  LIMIT 5
)
SELECT jsonb_build_object(
  'counts', jsonb_build_object(
    'dueToday', (SELECT count(*) FROM my_tasks, bounds WHERE due_at >= day_start AND due_at < day_end),
    'overdue', (SELECT count(*) FROM my_tasks WHERE overdue_days IS NOT NULL),
    'meetings', (SELECT count(*) FROM my_meetings, bounds WHERE start_at < day_end)
  ),
  'myWork', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.bucket, x.prio, x.due_sort)
     FROM (
       SELECT t.*,
              CASE WHEN t.overdue_days IS NOT NULL THEN 0
                   WHEN t.due_at >= b.day_start AND t.due_at < b.day_end THEN 1
                   ELSE 2 END AS bucket,
              CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END AS prio,
              COALESCE(t.due_at, 'infinity'::timestamptz) AS due_sort
       FROM my_tasks t, bounds b
       ORDER BY bucket, prio, due_sort
       LIMIT 8
     ) x), '[]'::jsonb),
  'meetings', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.start_at) FROM my_meetings m), '[]'::jsonb),
  'taskDeadlines', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.due_at)
     FROM (SELECT id, title, due_at FROM my_tasks, bounds
           WHERE due_at >= now() AND due_at < tomorrow_end ORDER BY due_at LIMIT 5) t), '[]'::jsonb),
  'notifications', COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.created_at DESC) FROM my_notifs n), '[]'::jsonb),
  'emails', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.updated_at DESC) FROM my_emails e), '[]'::jsonb)
);
$$;

GRANT EXECUTE ON FUNCTION public.get_home_summary() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_home_summary() FROM anon;