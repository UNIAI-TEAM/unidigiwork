-- ============================================================
-- UNIVERSAL SEARCH V2 — Postgres FTS/trigram foundation
-- ============================================================
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- Immutable accent/case/whitespace normalizer (indexable).
CREATE OR REPLACE FUNCTION public.search_norm(_t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, extensions
AS $$
  SELECT btrim(regexp_replace(
           lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(_t, ''))),
           '\s+', ' ', 'g'))
$$;

-- Normalized trigram indexes (accent-insensitive typeahead + fuzzy).
CREATE INDEX IF NOT EXISTS idx_workspaces_name_norm_trgm
  ON public.workspaces USING gin (public.search_norm(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tasks_title_norm_trgm
  ON public.tasks USING gin (public.search_norm(title) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_meetings_title_norm_trgm
  ON public.meetings USING gin (public.search_norm(title) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_documents_title_norm_trgm
  ON public.documents USING gin (public.search_norm(title) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_chat_channels_name_norm_trgm
  ON public.chat_channels USING gin (public.search_norm(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_email_threads_subject_norm_trgm
  ON public.email_threads USING gin (public.search_norm(subject) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_display_name_norm_trgm
  ON public.users USING gin (public.search_norm(display_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_primary_email_norm_trgm
  ON public.users USING gin (public.search_norm(primary_email) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_knowledge_title_norm_trgm
  ON public.knowledge_articles USING gin (public.search_norm(title) gin_trgm_ops);

-- ------------------------------------------------------------
-- search_universal: single permission-aware entry point.
-- SECURITY INVOKER on purpose -> every underlying RLS policy applies
-- as the calling user. Tenant boundary is additionally enforced by
-- an explicit tenant_id predicate validated against tenant_members.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_universal(
  _q text,
  _tenant_id uuid,
  _entity_types text[] DEFAULT NULL,
  _workspace_id uuid DEFAULT NULL,
  _limit integer DEFAULT 20,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  entity_type text,
  entity_id uuid,
  title text,
  subtitle text,
  snippet text,
  workspace_id uuid,
  workspace_name text,
  updated_at timestamptz,
  score numeric,
  match_type text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
DECLARE
  nq text := public.search_norm(_q);
  lim integer := greatest(1, least(coalesce(_limit, 20), 50));
  off integer := greatest(0, coalesce(_offset, 0));
  per integer := 40;
  me uuid := public.current_internal_user_id();
BEGIN
  IF nq IS NULL OR length(nq) < 2 THEN
    RETURN;
  END IF;
  -- Hard tenant boundary: caller must be an active member.
  IF _tenant_id IS NULL OR NOT public.is_tenant_member(_tenant_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH raw AS (
    -- PROJECT (workspace)
    (SELECT 'PROJECT'::text AS etype, w.id AS eid, w.name AS ttl,
            coalesce(nullif(w.description, ''), 'Dự án') AS sub,
            coalesce(left(w.description, 160), '') AS snip,
            w.id AS wsid, w.updated_at AS upd,
            public.search_norm(w.name) AS nt
     FROM public.workspaces w
     WHERE w.deleted_at IS NULL AND w.tenant_id = _tenant_id
       AND (_workspace_id IS NULL OR w.id = _workspace_id)
       AND (public.search_norm(w.name) LIKE '%' || nq || '%'
            OR public.search_norm(w.name) % nq)
     LIMIT per)
    UNION ALL
    -- TASK
    (SELECT 'TASK', t.id, t.title,
            'Công việc · ' || t.status::text,
            coalesce(left(t.description, 160), ''),
            t.workspace_id, t.updated_at, public.search_norm(t.title)
     FROM public.tasks t
     WHERE t.deleted_at IS NULL AND t.tenant_id = _tenant_id
       AND (_workspace_id IS NULL OR t.workspace_id = _workspace_id)
       AND (public.search_norm(t.title) LIKE '%' || nq || '%'
            OR public.search_norm(t.title) % nq
            OR left(t.id::text, 8) = nq)
     LIMIT per)
    UNION ALL
    -- MEETING
    (SELECT 'MEETING', m.id, m.title,
            'Cuộc họp · ' || to_char(m.start_at, 'DD/MM/YYYY HH24:MI'),
            coalesce(left(m.agenda, 160), ''),
            m.workspace_id, m.updated_at, public.search_norm(m.title)
     FROM public.meetings m
     WHERE m.deleted_at IS NULL AND m.tenant_id = _tenant_id
       AND (_workspace_id IS NULL OR m.workspace_id = _workspace_id)
       AND (public.search_norm(m.title) LIKE '%' || nq || '%'
            OR public.search_norm(m.title) % nq
            OR public.search_norm(coalesce(m.agenda, '')) LIKE '%' || nq || '%')
     LIMIT per)
    UNION ALL
    -- DOCUMENT
    (SELECT 'DOCUMENT', d.id, d.title,
            'Tài liệu · ' || coalesce(nullif(d.folder, ''), 'Chung'),
            coalesce(left(d.content, 160), ''),
            d.workspace_id, d.updated_at, public.search_norm(d.title)
     FROM public.documents d
     WHERE d.deleted_at IS NULL AND d.tenant_id = _tenant_id
       AND (_workspace_id IS NULL OR d.workspace_id = _workspace_id)
       AND (public.search_norm(d.title) LIKE '%' || nq || '%'
            OR public.search_norm(d.title) % nq)
     LIMIT per)
    UNION ALL
    -- EMAIL (thread subject only — no body in global overlay)
    (SELECT 'EMAIL', e.id, coalesce(nullif(e.subject, ''), '(Không tiêu đề)'),
            'Email · ' || to_char(coalesce(e.last_message_at, e.created_at), 'DD/MM/YYYY'),
            '',
            e.workspace_id, coalesce(e.last_message_at, e.updated_at),
            public.search_norm(e.subject)
     FROM public.email_threads e
     WHERE e.deleted_at IS NULL AND e.tenant_id = _tenant_id
       AND (_workspace_id IS NULL OR e.workspace_id = _workspace_id)
       AND (public.search_norm(e.subject) LIKE '%' || nq || '%'
            OR public.search_norm(e.subject) % nq)
     LIMIT per)
    UNION ALL
    -- CHAT_CHANNEL (private channels only for members)
    (SELECT 'CHAT_CHANNEL', c.id, c.name,
            CASE WHEN c.is_private THEN 'Kênh riêng tư' ELSE 'Kênh trao đổi' END,
            coalesce(left(c.description, 160), ''),
            c.workspace_id, coalesce(c.last_message_at, c.updated_at),
            public.search_norm(c.name)
     FROM public.chat_channels c
     WHERE c.deleted_at IS NULL AND c.tenant_id = _tenant_id
       AND c.kind = 'channel'
       AND (_workspace_id IS NULL OR c.workspace_id = _workspace_id)
       AND (c.is_private IS NOT TRUE OR EXISTS (
             SELECT 1 FROM public.chat_members cm
             WHERE cm.channel_id = c.id AND cm.user_id = me))
       AND (public.search_norm(c.name) LIKE '%' || nq || '%'
            OR public.search_norm(c.name) % nq)
     LIMIT per)
    UNION ALL
    -- PERSON (tenant directory)
    (SELECT DISTINCT ON (u.id) 'PERSON', u.id,
            coalesce(u.display_name, u.primary_email, 'Người dùng'),
            coalesce(u.primary_email, 'Thành viên'),
            '',
            NULL::uuid, u.updated_at, public.search_norm(coalesce(u.display_name, u.primary_email))
     FROM public.users u
     JOIN public.tenant_members tm ON tm.user_id = u.id
       AND tm.tenant_id = _tenant_id AND tm.status = 'active'
     WHERE (public.search_norm(u.display_name) LIKE '%' || nq || '%'
            OR public.search_norm(u.display_name) % nq
            OR public.search_norm(u.primary_email) LIKE '%' || nq || '%')
     LIMIT per)
  ),
  scored AS (
    SELECT r.*,
           CASE
             WHEN r.nt = nq THEN 100
             WHEN r.nt LIKE nq || '%' THEN 80
             WHEN r.nt LIKE '% ' || nq || '%' THEN 65
             WHEN r.nt LIKE '%' || nq || '%' THEN 55
             ELSE 25 + (similarity(r.nt, nq) * 25)
           END::numeric
           + CASE WHEN r.etype = 'PROJECT' THEN 6 WHEN r.etype = 'TASK' THEN 3 ELSE 0 END
           + CASE
               WHEN r.upd IS NULL THEN 0
               WHEN r.upd > now() - interval '7 days' THEN 3
               WHEN r.upd > now() - interval '30 days' THEN 1
               ELSE 0
             END AS sc,
           CASE
             WHEN r.nt = nq THEN 'EXACT'
             WHEN r.nt LIKE nq || '%' THEN 'PREFIX'
             WHEN r.nt LIKE '%' || nq || '%' THEN 'LEXICAL'
             ELSE 'FUZZY'
           END AS mtype
    FROM raw r
  ),
  filtered AS (
    SELECT s.* FROM scored s
    WHERE _entity_types IS NULL
       OR array_length(_entity_types, 1) IS NULL
       OR s.etype = ANY(_entity_types)
  )
  SELECT f.etype, f.eid, f.ttl, f.sub, f.snip, f.wsid,
         (SELECT w2.name FROM public.workspaces w2 WHERE w2.id = f.wsid),
         f.upd, round(f.sc, 2), f.mtype,
         (SELECT count(*) FROM filtered)::bigint
  FROM filtered f
  ORDER BY f.sc DESC, f.upd DESC NULLS LAST, f.ttl ASC
  LIMIT lim OFFSET off;
END;
$fn$;

REVOKE ALL ON FUNCTION public.search_universal(text, uuid, text[], uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_universal(text, uuid, text[], uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_norm(text) TO authenticated, anon, service_role;