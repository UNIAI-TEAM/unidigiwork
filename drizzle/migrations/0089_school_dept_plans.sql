CREATE TABLE public.school_dept_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  department text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('lesson','assignment','weekly')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  class_name text CHECK (class_name IS NULL OR char_length(class_name) <= 40),
  starts_at timestamptz,
  ends_at timestamptz,
  body text CHECK (body IS NULL OR char_length(body) <= 8000),
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  row_version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_by uuid,
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX school_dept_plans_dept_idx ON public.school_dept_plans(tenant_id, department, starts_at);
GRANT SELECT ON public.school_dept_plans TO authenticated;
GRANT ALL ON public.school_dept_plans TO service_role;
ALTER TABLE public.school_dept_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dept members read plans" ON public.school_dept_plans FOR SELECT TO authenticated
  USING (public._school_is_bgh(tenant_id, auth.uid()) OR public._school_user_dept(tenant_id, auth.uid()) = department);

CREATE OR REPLACE FUNCTION public._school_can_post_dept(_tenant uuid, _dept text, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public._school_is_bgh(_tenant, _uid) OR public._school_user_dept(_tenant, _uid) = _dept
$$;

CREATE OR REPLACE FUNCTION public.school_list_dept_plans(_tenant_id uuid, _department text, _from timestamptz, _to timestamptz)
RETURNS TABLE(id uuid, kind text, title text, class_name text, starts_at timestamptz, ends_at timestamptz, body text,
  task_id uuid, task_status text, created_by uuid, author_name text, created_at timestamptz, can_edit boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _lead boolean;
BEGIN
  IF _uid IS NULL OR NOT public._school_can_post_dept(_tenant_id, _department, _uid) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  _lead := public._school_is_bgh(_tenant_id, _uid) OR EXISTS (SELECT 1 FROM tenant_members m WHERE m.tenant_id=_tenant_id AND m.user_id=_uid AND m.role='manager' AND m.status='active');
  RETURN QUERY
  SELECT p.id, p.kind, p.title, p.class_name, p.starts_at, p.ends_at, p.body, p.task_id, t.status::text,
    p.created_by, COALESCE(pr.display_name, pr.email), p.created_at, (_lead OR p.created_by = _uid)
  FROM school_dept_plans p
  LEFT JOIN tasks t ON t.id = p.task_id
  LEFT JOIN profiles pr ON pr.id = p.created_by
  WHERE p.tenant_id=_tenant_id AND p.department=_department
    AND (p.starts_at IS NULL OR (p.starts_at >= _from AND p.starts_at < _to))
  ORDER BY p.starts_at NULLS LAST, p.created_at;
END $$;

CREATE OR REPLACE FUNCTION public.school_save_dept_plan(_tenant_id uuid, _department text, _kind text, _title text,
  _class_name text, _starts_at timestamptz, _ends_at timestamptz, _body text, _idempotency_key text, _correlation_id text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _id uuid; _ws uuid; _task public.tasks;
BEGIN
  IF _uid IS NULL OR NOT public._school_can_post_dept(_tenant_id, _department, _uid) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  SELECT p.id INTO _id FROM school_dept_plans p WHERE p.tenant_id=_tenant_id AND p.idempotency_key=_idempotency_key;
  IF _id IS NOT NULL THEN RETURN _id; END IF;
  IF _kind = 'lesson' AND (_starts_at IS NULL OR _ends_at IS NULL OR _ends_at <= _starts_at) THEN RAISE EXCEPTION 'INVALID_TIME'; END IF;
  IF _kind = 'assignment' AND _starts_at IS NULL THEN RAISE EXCEPTION 'DUE_REQUIRED'; END IF;
  IF _kind = 'assignment' THEN
    SELECT w.id INTO _ws FROM workspaces w WHERE w.tenant_id=_tenant_id ORDER BY w.created_at LIMIT 1;
    _task := public.create_task(_ws, _title, _body, 'normal', _starts_at, _uid, 'plan:'||_idempotency_key, _correlation_id);
  END IF;
  INSERT INTO school_dept_plans(tenant_id, department, kind, title, class_name, starts_at, ends_at, body, task_id, idempotency_key, created_by, updated_by)
  VALUES (_tenant_id, _department, _kind, btrim(_title), NULLIF(btrim(_class_name),''), _starts_at, _ends_at, NULLIF(_body,''), _task.id, _idempotency_key, _uid, _uid)
  RETURNING id INTO _id;
  PERFORM public._emit_outbox_event(_tenant_id, 'school.dept_plan.created', 'school_dept_plan', _id::text,
    jsonb_build_object('id',_id,'department',_department,'kind',_kind,'task_id',_task.id,'actor_id',_uid), _idempotency_key, _correlation_id);
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.school_delete_dept_plan(_tenant_id uuid, _id uuid, _correlation_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _p school_dept_plans;
BEGIN
  SELECT * INTO _p FROM school_dept_plans WHERE id=_id AND tenant_id=_tenant_id;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT (_p.created_by = _uid OR public._school_is_bgh(_tenant_id,_uid)
    OR (public._school_user_dept(_tenant_id,_uid) = _p.department AND EXISTS (SELECT 1 FROM tenant_members m WHERE m.tenant_id=_tenant_id AND m.user_id=_uid AND m.role='manager' AND m.status='active'))) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF _p.task_id IS NOT NULL THEN
    UPDATE tasks SET status='canceled', updated_by=_uid, updated_at=now() WHERE id=_p.task_id AND status NOT IN ('done','canceled');
  END IF;
  DELETE FROM school_dept_plans WHERE id=_id;
  PERFORM public._emit_outbox_event(_tenant_id, 'school.dept_plan.deleted', 'school_dept_plan', _id::text,
    jsonb_build_object('id',_id,'department',_p.department,'actor_id',_uid), NULL, _correlation_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.school_list_dept_plans(uuid,text,timestamptz,timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.school_save_dept_plan(uuid,text,text,text,text,timestamptz,timestamptz,text,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.school_delete_dept_plan(uuid,uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.school_list_dept_plans(uuid,text,timestamptz,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.school_save_dept_plan(uuid,text,text,text,text,timestamptz,timestamptz,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.school_delete_dept_plan(uuid,uuid,text) TO authenticated;