CREATE TABLE public.school_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workspace_id uuid NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  trigger text NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual','scheduled')),
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','no_data','error')),
  content text NOT NULL DEFAULT '',
  facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  idempotency_key text NULL,
  row_version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  updated_by uuid NULL,
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX school_briefs_scope_idx ON public.school_briefs(tenant_id, workspace_id, created_at DESC);
GRANT SELECT ON public.school_briefs TO authenticated;
GRANT ALL ON public.school_briefs TO service_role;
ALTER TABLE public.school_briefs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._school_is_leader(_tenant_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant_id AND m.user_id=_uid
    AND m.status='active' AND m.role IN ('tenant_owner','tenant_admin','manager'))
$$;
CREATE OR REPLACE FUNCTION public._school_can_view_ws(_tenant_id uuid, _ws uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public._school_is_leader(_tenant_id,_uid)
    OR (_ws IS NOT NULL AND EXISTS (SELECT 1 FROM public.workspace_members wm JOIN public.workspaces w ON w.id=wm.workspace_id
         WHERE wm.workspace_id=_ws AND wm.user_id=_uid AND w.tenant_id=_tenant_id))
$$;

CREATE POLICY "school briefs read" ON public.school_briefs FOR SELECT TO authenticated
  USING (public._school_can_view_ws(tenant_id, workspace_id, auth.uid()));

-- Tổng hợp theo tổ: chỉ số liệu + tối đa 5 việc quá hạn/tổ. Lãnh đạo thấy mọi tổ; thành viên chỉ tổ mình.
CREATE OR REPLACE FUNCTION public.school_overview(_tenant_id uuid)
RETURNS TABLE(workspace_id uuid, name text, open_tasks int, overdue int, blocked int, done_7d int, meetings_7d int, overdue_titles text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _svc boolean := coalesce(auth.role(),'')='service_role'; _lead boolean;
BEGIN
  IF NOT _svc AND NOT EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant_id AND m.user_id=_uid AND m.status='active') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  _lead := _svc OR public._school_is_leader(_tenant_id,_uid);
  RETURN QUERY
  SELECT w.id, w.name::text,
    (SELECT count(*)::int FROM public.tasks t WHERE t.workspace_id=w.id AND t.deleted_at IS NULL AND t.status IN ('todo','in_progress','blocked')),
    (SELECT count(*)::int FROM public.tasks t WHERE t.workspace_id=w.id AND t.deleted_at IS NULL AND t.status IN ('todo','in_progress','blocked') AND t.due_at < now()),
    (SELECT count(*)::int FROM public.tasks t WHERE t.workspace_id=w.id AND t.deleted_at IS NULL AND t.status='blocked'),
    (SELECT count(*)::int FROM public.tasks t WHERE t.workspace_id=w.id AND t.deleted_at IS NULL AND t.status='done' AND t.completed_at >= now()-interval '7 days'),
    (SELECT count(*)::int FROM public.meetings mt WHERE mt.workspace_id=w.id AND mt.deleted_at IS NULL AND mt.status IN ('scheduled','live') AND mt.start_at BETWEEN now() AND now()+interval '7 days'),
    ARRAY(SELECT t.title FROM public.tasks t WHERE t.workspace_id=w.id AND t.deleted_at IS NULL AND t.status IN ('todo','in_progress','blocked') AND t.due_at < now() ORDER BY t.due_at LIMIT 5)
  FROM public.workspaces w
  WHERE w.tenant_id=_tenant_id AND w.deleted_at IS NULL
    AND (_lead OR EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id=w.id AND wm.user_id=_uid))
  ORDER BY w.name;
END $$;

CREATE OR REPLACE FUNCTION public.save_school_brief(_tenant_id uuid, _workspace_id uuid, _content text, _facts jsonb,
  _trigger text, _status text, _idempotency_key text DEFAULT NULL, _correlation_id text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _svc boolean := coalesce(auth.role(),'')='service_role'; _id uuid;
BEGIN
  IF NOT _svc AND (_uid IS NULL OR NOT public._school_can_view_ws(_tenant_id,_workspace_id,_uid)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _workspace_id IS NULL AND NOT _svc AND NOT public._school_is_leader(_tenant_id,_uid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _trigger='scheduled' AND NOT _svc THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO _id FROM public.school_briefs WHERE tenant_id=_tenant_id AND idempotency_key=_idempotency_key;
    IF _id IS NOT NULL THEN RETURN _id; END IF;
  END IF;
  INSERT INTO public.school_briefs(tenant_id, workspace_id, trigger, status, content, facts, idempotency_key, created_by, updated_by)
  VALUES (_tenant_id, _workspace_id, _trigger, _status, left(coalesce(_content,''),20000), coalesce(_facts,'[]'::jsonb), _idempotency_key, _uid, _uid)
  RETURNING id INTO _id;
  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (_tenant_id, _uid, 'school.brief_created', 'school_brief', _id::text,
    jsonb_build_object('workspace_id',_workspace_id,'trigger',_trigger,'status',_status,'idempotency_key',_idempotency_key), _correlation_id);
  PERFORM public._emit_outbox_event(_tenant_id, 'school.brief_created.v1', 'school_brief', _id::text,
    jsonb_build_object('brief_id',_id,'workspace_id',_workspace_id,'trigger',_trigger), _idempotency_key, _correlation_id);
  RETURN _id;
END $$;

-- Thông báo trong ứng dụng cho vai trò nhận bản tin (chỉ gọi từ máy chủ).
CREATE OR REPLACE FUNCTION public.notify_school_brief(_brief_id uuid, _roles text[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _b public.school_briefs; _n int;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO _b FROM public.school_briefs WHERE id=_brief_id;
  IF _b.id IS NULL THEN RETURN 0; END IF;
  INSERT INTO public.notifications(tenant_id, scope_type, user_id, type, title, body, link, meta)
  SELECT _b.tenant_id, 'tenant', m.user_id, 'school.brief', 'Bản tin điều hành buổi sáng', left(_b.content, 280), '/school-ops',
    jsonb_build_object('brief_id', _b.id)
  FROM public.tenant_members m WHERE m.tenant_id=_b.tenant_id AND m.status='active' AND m.role::text = ANY(_roles);
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

REVOKE ALL ON FUNCTION public.school_overview(uuid), public.save_school_brief(uuid,uuid,text,jsonb,text,text,text,text), public.notify_school_brief(uuid,text[]), public._school_is_leader(uuid,uuid), public._school_can_view_ws(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_overview(uuid), public.save_school_brief(uuid,uuid,text,jsonb,text,text,text,text), public._school_is_leader(uuid,uuid), public._school_can_view_ws(uuid,uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_school_brief(uuid,text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.list_school_briefs(_tenant_id uuid, _workspace_id uuid, _limit int DEFAULT 10)
RETURNS SETOF public.school_briefs LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT * FROM public.school_briefs WHERE tenant_id=_tenant_id
    AND workspace_id IS NOT DISTINCT FROM _workspace_id ORDER BY created_at DESC LIMIT least(greatest(_limit,1),50)
$$;
GRANT EXECUTE ON FUNCTION public.list_school_briefs(uuid,uuid,int) TO authenticated;