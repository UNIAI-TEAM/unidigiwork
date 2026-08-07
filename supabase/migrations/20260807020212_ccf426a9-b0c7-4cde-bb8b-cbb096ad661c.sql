CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_tasks_title_trgm ON public.tasks USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tasks_ws_updated ON public.tasks (workspace_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_title_trgm ON public.documents USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_documents_ws_updated ON public.documents (workspace_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_title_trgm ON public.meetings USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_meetings_ws_start ON public.meetings (workspace_id, start_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_display_name_trgm ON public.users USING gin (display_name gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.global_search(
  _q text DEFAULT NULL,
  _kinds text[] DEFAULT NULL,
  _workspace_id uuid DEFAULT NULL,
  _assignee_id uuid DEFAULT NULL,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _sort text DEFAULT 'relevance',
  _limit integer DEFAULT 20,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id text,
  kind text,
  title text,
  snippet text,
  occurred_at timestamptz,
  workspace_id uuid,
  workspace_name text,
  owner_id uuid,
  owner_name text,
  score integer,
  total_count bigint,
  kind_counts jsonb
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH needle AS (
  SELECT nullif(btrim(coalesce(_q, '')), '') AS n
),
unioned AS (
  -- meetings
  SELECT m.id::text AS id, 'meeting'::text AS kind, m.title,
         coalesce(nullif(m.agenda, ''), coalesce(m.location, 'Cuộc họp')) AS snippet,
         m.start_at AS occurred_at, m.workspace_id, m.created_by AS owner_id
  FROM meetings m
  WHERE m.deleted_at IS NULL
  UNION ALL
  -- tasks (all)
  SELECT t.id::text, 'task', t.title,
         coalesce(nullif(t.description, ''), 'Công việc · ' || t.status::text),
         coalesce(t.due_at, t.updated_at), t.workspace_id, t.created_by
  FROM tasks t
  WHERE t.deleted_at IS NULL
  UNION ALL
  -- deadlines = tasks with a due date, not completed
  SELECT t.id::text, 'deadline', t.title,
         'Hạn chót · ' || to_char(t.due_at, 'DD/MM/YYYY HH24:MI'),
         t.due_at, t.workspace_id, t.created_by
  FROM tasks t
  WHERE t.deleted_at IS NULL AND t.due_at IS NOT NULL
    AND t.status NOT IN ('done', 'canceled')
  UNION ALL
  -- documents
  SELECT d.id::text, 'document', d.title,
         coalesce(nullif(left(d.content, 240), ''), d.folder),
         d.updated_at, d.workspace_id, d.created_by
  FROM documents d
  WHERE d.deleted_at IS NULL
  UNION ALL
  -- people (workspace members)
  SELECT u.id::text, 'person', coalesce(u.display_name, u.primary_email, 'Người dùng'),
         coalesce(u.primary_email, ''), u.created_at, wm.workspace_id, u.id
  FROM workspace_members wm
  JOIN users u ON u.id = wm.user_id
),
scoped AS (
  SELECT s.*, w.name AS workspace_name,
         coalesce(ow.display_name, ow.primary_email) AS owner_name,
         CASE
           WHEN (SELECT n FROM needle) IS NULL THEN 0
           WHEN s.title ILIKE (SELECT n FROM needle) THEN 5
           WHEN s.title ILIKE (SELECT n FROM needle) || '%' THEN 4
           WHEN s.title ILIKE '%' || (SELECT n FROM needle) || '%' THEN 3
           ELSE 1
         END AS score
  FROM unioned s
  JOIN workspaces w ON w.id = s.workspace_id AND w.deleted_at IS NULL
  LEFT JOIN users ow ON ow.id = s.owner_id
  WHERE ((SELECT n FROM needle) IS NULL
         OR s.title ILIKE '%' || (SELECT n FROM needle) || '%'
         OR s.snippet ILIKE '%' || (SELECT n FROM needle) || '%')
    AND (_workspace_id IS NULL OR s.workspace_id = _workspace_id)
    AND (_assignee_id IS NULL OR s.owner_id = _assignee_id
         OR (s.kind IN ('task','deadline') AND EXISTS (
               SELECT 1 FROM task_assignees ta
               WHERE ta.task_id = s.id::uuid AND ta.user_id = _assignee_id)))
    AND (_from IS NULL OR (s.occurred_at IS NOT NULL AND s.occurred_at >= _from))
    AND (_to IS NULL OR (s.occurred_at IS NOT NULL AND s.occurred_at <= _to))
),
agg AS (
  SELECT count(*) AS total_all,
         jsonb_object_agg(k, c) AS counts
  FROM (SELECT kind AS k, count(*) AS c FROM scoped GROUP BY kind) x
),
filtered AS (
  SELECT * FROM scoped
  WHERE _kinds IS NULL OR array_length(_kinds, 1) IS NULL OR kind = ANY(_kinds)
)
SELECT f.id, f.kind, f.title, f.snippet, f.occurred_at, f.workspace_id,
       f.workspace_name, f.owner_id, f.owner_name, f.score,
       (SELECT count(*) FROM filtered)::bigint AS total_count,
       coalesce((SELECT counts FROM agg), '{}'::jsonb)
         || jsonb_build_object('all', coalesce((SELECT total_all FROM agg), 0)) AS kind_counts
FROM filtered f
ORDER BY
  CASE WHEN _sort = 'time' THEN 0 ELSE f.score END DESC,
  f.occurred_at DESC NULLS LAST,
  f.title ASC
LIMIT greatest(1, least(coalesce(_limit, 20), 100))
OFFSET greatest(0, coalesce(_offset, 0));
$$;

GRANT EXECUTE ON FUNCTION public.global_search(text, text[], uuid, uuid, timestamptz, timestamptz, text, integer, integer) TO authenticated;