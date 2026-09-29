CREATE OR REPLACE FUNCTION public.school_save_dept_plan(_tenant_id uuid, _department text, _kind text, _title text, _class_name text, _starts_at timestamp with time zone, _ends_at timestamp with time zone, _body text, _idempotency_key text, _correlation_id text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _id uuid; _ws uuid; _task public.tasks; _task_title text;
BEGIN
  IF _uid IS NULL OR NOT public._school_can_post_dept(_tenant_id, _department, _uid) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  SELECT p.id INTO _id FROM school_dept_plans p WHERE p.tenant_id=_tenant_id AND p.idempotency_key=_idempotency_key;
  IF _id IS NOT NULL THEN RETURN _id; END IF;
  IF _kind = 'lesson' AND (_starts_at IS NULL OR _ends_at IS NULL OR _ends_at <= _starts_at) THEN RAISE EXCEPTION 'INVALID_TIME'; END IF;
  IF _kind = 'assignment' AND _starts_at IS NULL THEN RAISE EXCEPTION 'DUE_REQUIRED'; END IF;
  IF _kind IN ('assignment','lesson') THEN
    SELECT w.id INTO _ws FROM workspaces w WHERE w.tenant_id=_tenant_id ORDER BY w.created_at LIMIT 1;
    _task_title := btrim(_title) || COALESCE(' · ' || NULLIF(btrim(_class_name),''), '');
    _task := public.create_task(_ws, _task_title, _body, 'normal',
      CASE WHEN _kind='lesson' THEN _ends_at ELSE _starts_at END,
      _uid, 'plan:'||_idempotency_key, _correlation_id);
  END IF;
  INSERT INTO school_dept_plans(tenant_id, department, kind, title, class_name, starts_at, ends_at, body, task_id, idempotency_key, created_by, updated_by)
  VALUES (_tenant_id, _department, _kind, btrim(_title), NULLIF(btrim(_class_name),''), _starts_at, _ends_at, NULLIF(_body,''), _task.id, _idempotency_key, _uid, _uid)
  RETURNING id INTO _id;
  PERFORM public._emit_outbox_event(_tenant_id, 'school.dept_plan.created', 'school_dept_plan', _id::text,
    jsonb_build_object('id',_id,'department',_department,'kind',_kind,'task_id',_task.id,'actor_id',_uid), _idempotency_key, _correlation_id);
  RETURN _id;
END $function$;