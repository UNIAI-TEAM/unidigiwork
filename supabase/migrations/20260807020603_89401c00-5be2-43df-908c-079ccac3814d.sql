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
people AS (
  SELECT DISTINCT ON (u.id)
         u.id::text AS id, 'person'::text AS kind,
         coalesce(u.display_name, u.primary_email, 'Người dùng') AS title,
         coalesce(u.primary_email, '') AS snippet,
         u.created_at AS occurred_at, wm.workspace_id, u.id AS owner_id
  FROM workspace_members wm
  JOIN users u ON u.id = wm.user_id
  ORDER BY u.id, wm.created_at ASC
),
unioned AS (
  SELECT m.id::text AS id, 'meeting'::text AS kind, m.title,
         coalesce(nullif(m.agenda, ''), coalesce(m.location, 'Cuộc họp')) AS snippet,
         m.start_at AS occurred_at, m.workspace_id, m.created_by AS owner_id
  FROM meetings m WHERE m.deleted_at IS NULL
  UNION ALL
  SELECT t.id::text, 'task', t.title,
         coalesce(nullif(t.description, ''), 'Công việc · ' || t.status::text),
         coalesce(t.due_at, t.updated_at), t.workspace_id, t.created_by
  FROM tasks t WHERE t.deleted_at IS NULL
  UNION ALL
  SELECT t.id::text, 'deadline', t.title,
         'Hạn chót · ' || to_char(t.due_at, 'DD/MM/YYYY HH24:MI'),
         t.due_at, t.workspace_id, t.created_by
  FROM tasks t
  WHERE t.deleted_at IS NULL AND t.due_at IS NOT NULL
    AND t.status NOT IN ('done', 'canceled')
  UNION ALL
  SELECT d.id::text, 'document', d.title,
         coalesce(nullif(left(d.content, 240), ''), d.folder),
         d.updated_at, d.workspace_id, d.created_by
  FROM documents d WHERE d.deleted_at IS NULL
  UNION ALL
  SELECT id, kind, title, snippet, occurred_at, workspace_id, owner_id FROM people
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
per_kind AS (
  SELECT kind AS k, count(*)::bigint AS c FROM scoped GROUP BY kind
),
agg AS (
  SELECT coalesce(sum(c), 0)::bigint AS total_all,
         coalesce(jsonb_object_agg(k, c), '{}'::jsonb) AS counts
  FROM per_kind
),
filtered AS (
  SELECT * FROM scoped
  WHERE _kinds IS NULL OR array_length(_kinds, 1) IS NULL OR kind = ANY(_kinds)
)
SELECT f.id, f.kind, f.title, f.snippet, f.occurred_at, f.workspace_id,
       f.workspace_name, f.owner_id, f.owner_name, f.score,
       (SELECT count(*) FROM filtered)::bigint,
       (SELECT counts FROM agg) || jsonb_build_object('all', (SELECT total_all FROM agg))
FROM filtered f
ORDER BY
  CASE WHEN _sort = 'time' THEN 0 ELSE f.score END DESC,
  f.occurred_at DESC NULLS LAST,
  f.title ASC
LIMIT greatest(1, least(coalesce(_limit, 20), 100))
OFFSET greatest(0, coalesce(_offset, 0));
$$;

GRANT EXECUTE ON FUNCTION public.global_search(text, text[], uuid, uuid, timestamptz, timestamptz, text, integer, integer) TO authenticated;