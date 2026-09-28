-- Lịch họp trường học: BGH quản lý mọi lịch; tổ trưởng quản lý lịch của tổ mình; người tạo quản lý lịch của mình.
CREATE OR REPLACE FUNCTION public._school_can_manage_meeting(_tenant_id uuid, _department text, _created_by uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public._school_is_bgh(_tenant_id,_uid)
    OR (_created_by = _uid AND EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant_id AND m.user_id=_uid AND m.status='active'))
    OR (_department IS NOT NULL AND _department = public._school_user_dept(_tenant_id,_uid)
        AND EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant_id AND m.user_id=_uid AND m.status='active' AND m.role='manager'))
$$;
REVOKE ALL ON FUNCTION public._school_can_manage_meeting(uuid,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._school_can_manage_meeting(uuid,text,uuid,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.school_meetings(_tenant_id uuid, _department text, _from timestamptz, _to timestamptz)
RETURNS TABLE(id uuid, title text, start_at timestamptz, end_at timestamptz, status text, location text, agenda text, department text, row_version bigint, can_manage boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
#variable_conflict use_column
DECLARE _uid uuid := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant_id AND m.user_id=_uid AND m.status='active') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _to - _from > interval '62 days' THEN RAISE EXCEPTION 'RANGE_TOO_LARGE'; END IF;
  IF _department IS NULL AND NOT public._school_is_bgh(_tenant_id,_uid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _department IS NOT NULL AND NOT public._school_can_view_dept(_tenant_id,_department,_uid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN QUERY
  SELECT mt.id, mt.title::text, mt.start_at, mt.end_at, mt.status::text, mt.location::text, mt.agenda::text,
         nullif(btrim(mt.department),''), mt.row_version::bigint,
         public._school_can_manage_meeting(_tenant_id, nullif(btrim(mt.department),''), mt.created_by, _uid)
  FROM public.meetings mt
  WHERE mt.tenant_id=_tenant_id AND mt.deleted_at IS NULL AND mt.start_at >= _from AND mt.start_at < _to
    AND (_department IS NULL OR btrim(mt.department)=_department)
  ORDER BY mt.start_at;
END $$;
REVOKE ALL ON FUNCTION public.school_meetings(uuid,text,timestamptz,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_meetings(uuid,text,timestamptz,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.school_save_meeting(
  _tenant_id uuid, _meeting_id uuid, _title text, _start_at timestamptz, _end_at timestamptz,
  _location text, _agenda text, _department text, _idempotency_key text, _correlation_id text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _m public.meetings; _ws uuid; _id uuid; _dept text := nullif(btrim(coalesce(_department,'')),'');
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF coalesce(btrim(_title),'')='' OR length(_title)>500 OR _end_at <= _start_at THEN RAISE EXCEPTION 'VALIDATION_FAILED'; END IF;
  IF NOT public._school_is_bgh(_tenant_id,_uid) THEN
    -- tổ trưởng/giáo viên chỉ đặt lịch cho tổ của mình
    IF _dept IS NULL OR _dept IS DISTINCT FROM public._school_user_dept(_tenant_id,_uid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  END IF;
  IF _meeting_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant_id AND m.user_id=_uid AND m.status='active' AND m.role IN ('tenant_owner','tenant_admin','manager')) THEN
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
    IF _idempotency_key IS NOT NULL THEN
      SELECT id INTO _id FROM public.meetings WHERE tenant_id=_tenant_id AND idempotency_key=_idempotency_key LIMIT 1;
      IF _id IS NOT NULL THEN RETURN _id; END IF;
    END IF;
    SELECT w.id INTO _ws FROM public.workspaces w JOIN public.workspace_members wm ON wm.workspace_id=w.id AND wm.user_id=_uid
      WHERE w.tenant_id=_tenant_id ORDER BY w.created_at LIMIT 1;
    IF _ws IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    SELECT (r).id INTO _id FROM (SELECT public.schedule_meeting(_ws, btrim(_title), _start_at, _end_at, _agenda, 'Asia/Ho_Chi_Minh', NULL, _location, NULL, _idempotency_key, _correlation_id) AS r) s;
    UPDATE public.meetings SET department=_dept WHERE id=_id;
    RETURN _id;
  END IF;
  SELECT * INTO _m FROM public.meetings WHERE id=_meeting_id AND tenant_id=_tenant_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND'; END IF;
  IF _m.status IN ('ended','canceled') THEN RAISE EXCEPTION 'MEETING_NOT_EDITABLE'; END IF;
  IF NOT public._school_can_manage_meeting(_tenant_id, nullif(btrim(_m.department),''), _m.created_by, _uid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.meetings SET title=btrim(_title), start_at=_start_at, end_at=_end_at, location=_location, agenda=_agenda,
    department=_dept, row_version=row_version+1, updated_by=_uid, updated_at=now() WHERE id=_meeting_id;
  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (_tenant_id, _uid, 'meeting.updated', 'meeting', _meeting_id::text, jsonb_build_object('department',_dept,'source','school'), _correlation_id);
  PERFORM public._emit_outbox_event(_tenant_id, 'meeting.updated.v1', 'meeting', _meeting_id::text,
    jsonb_build_object('meeting_id',_meeting_id,'department',_dept), _idempotency_key, _correlation_id);
  RETURN _meeting_id;
END $$;
REVOKE ALL ON FUNCTION public.school_save_meeting(uuid,uuid,text,timestamptz,timestamptz,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_save_meeting(uuid,uuid,text,timestamptz,timestamptz,text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.school_cancel_meeting(_tenant_id uuid, _meeting_id uuid, _reason text, _idempotency_key text, _correlation_id text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _m public.meetings;
BEGIN
  SELECT * INTO _m FROM public.meetings WHERE id=_meeting_id AND tenant_id=_tenant_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND'; END IF;
  IF _m.status = 'canceled' THEN RETURN _meeting_id; END IF;
  IF _m.status = 'ended' THEN RAISE EXCEPTION 'MEETING_NOT_EDITABLE'; END IF;
  IF _uid IS NULL OR NOT public._school_can_manage_meeting(_tenant_id, nullif(btrim(_m.department),''), _m.created_by, _uid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.meetings SET status='canceled', row_version=row_version+1, updated_by=_uid, updated_at=now() WHERE id=_meeting_id;
  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (_tenant_id, _uid, 'meeting.canceled', 'meeting', _meeting_id::text, jsonb_build_object('reason',left(coalesce(_reason,''),1000),'source','school'), _correlation_id);
  PERFORM public._emit_outbox_event(_tenant_id, 'meeting.canceled.v1', 'meeting', _meeting_id::text,
    jsonb_build_object('meeting_id',_meeting_id,'reason',left(coalesce(_reason,''),1000)), _idempotency_key, _correlation_id);
  RETURN _meeting_id;
END $$;
REVOKE ALL ON FUNCTION public.school_cancel_meeting(uuid,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_cancel_meeting(uuid,uuid,text,text,text) TO authenticated;