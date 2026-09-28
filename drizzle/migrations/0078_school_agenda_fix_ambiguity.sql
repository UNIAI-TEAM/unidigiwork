CREATE OR REPLACE FUNCTION public.school_agenda(_tenant_id uuid, _workspace_id uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(kind text, id uuid, title text, at timestamptz, end_at timestamptz, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE _uid uuid := auth.uid(); _lead boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant_id AND m.user_id=_uid AND m.status='active') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF _to - _from > interval '62 days' THEN RAISE EXCEPTION 'RANGE_TOO_LARGE'; END IF;
  _lead := public._school_is_leader(_tenant_id,_uid);
  RETURN QUERY
  WITH ws AS (
    SELECT w.id AS wid FROM public.workspaces w
    WHERE w.tenant_id=_tenant_id AND w.deleted_at IS NULL
      AND (_workspace_id IS NULL OR w.id=_workspace_id)
      AND (_lead OR EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=w.id AND wm.user_id=_uid))
  ), items AS (
    SELECT 'meeting'::text AS k, mt.id AS i, mt.title::text AS ti, mt.start_at AS a, mt.end_at AS e, mt.status::text AS s
      FROM public.meetings mt WHERE mt.workspace_id IN (SELECT wid FROM ws) AND mt.deleted_at IS NULL
        AND mt.status <> 'canceled' AND mt.start_at >= _from AND mt.start_at < _to
    UNION ALL
    SELECT 'task'::text, t.id, t.title::text, t.due_at, NULL::timestamptz, t.status::text
      FROM public.tasks t WHERE t.workspace_id IN (SELECT wid FROM ws) AND t.deleted_at IS NULL
        AND t.status <> 'canceled' AND t.due_at >= _from AND t.due_at < _to
    UNION ALL
    SELECT 'brief'::text, b.id, b.trigger::text, b.created_at, NULL::timestamptz, b.status::text
      FROM public.school_briefs b WHERE b.tenant_id=_tenant_id
        AND b.created_at >= _from AND b.created_at < _to
        AND ((_workspace_id IS NULL AND b.workspace_id IS NULL AND _lead)
          OR (b.workspace_id IS NOT NULL AND b.workspace_id=_workspace_id AND b.workspace_id IN (SELECT wid FROM ws)))
  )
  SELECT items.k, items.i, items.ti, items.a, items.e, items.s FROM items ORDER BY items.a;
END $$;