CREATE OR REPLACE FUNCTION public.school_agenda(_tenant_id uuid, _workspace_id uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(kind text, id uuid, title text, at timestamptz, end_at timestamptz, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid := auth.uid(); _lead boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant_id AND m.user_id=_uid AND m.status='active') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF _to - _from > interval '62 days' THEN RAISE EXCEPTION 'RANGE_TOO_LARGE'; END IF;
  _lead := public._school_is_leader(_tenant_id,_uid);
  RETURN QUERY
  WITH ws AS (
    SELECT w.id FROM public.workspaces w
    WHERE w.tenant_id=_tenant_id AND w.deleted_at IS NULL
      AND (_workspace_id IS NULL OR w.id=_workspace_id)
      AND (_lead OR EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=w.id AND wm.user_id=_uid))
  )
  SELECT 'meeting'::text, mt.id, mt.title::text, mt.start_at, mt.end_at, mt.status::text
    FROM public.meetings mt WHERE mt.workspace_id IN (SELECT id FROM ws) AND mt.deleted_at IS NULL
      AND mt.status <> 'canceled' AND mt.start_at >= _from AND mt.start_at < _to
  UNION ALL
  SELECT 'task', t.id, t.title::text, t.due_at, NULL::timestamptz, t.status::text
    FROM public.tasks t WHERE t.workspace_id IN (SELECT id FROM ws) AND t.deleted_at IS NULL
      AND t.status <> 'canceled' AND t.due_at >= _from AND t.due_at < _to
  UNION ALL
  SELECT 'brief', b.id, b.trigger::text, b.created_at, NULL::timestamptz, b.status::text
    FROM public.school_briefs b WHERE b.tenant_id=_tenant_id
      AND b.created_at >= _from AND b.created_at < _to
      AND ((_workspace_id IS NULL AND b.workspace_id IS NULL AND _lead) OR (b.workspace_id IS NOT NULL AND b.workspace_id=_workspace_id AND b.workspace_id IN (SELECT id FROM ws)))
  ORDER BY 4;
END $$;
REVOKE ALL ON FUNCTION public.school_agenda(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_agenda(uuid,uuid,timestamptz,timestamptz) TO authenticated, service_role;