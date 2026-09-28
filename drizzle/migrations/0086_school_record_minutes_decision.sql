CREATE OR REPLACE FUNCTION public.school_record_minutes_decision(
  _meeting_id uuid, _title text, _detail text, _evidence text, _department text, _idempotency_key text, _correlation_id text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); m public.meetings%ROWTYPE; _id uuid; _t text := btrim(left(coalesce(_title,''),300));
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  IF _t = '' THEN RAISE EXCEPTION 'INVALID_TITLE' USING ERRCODE='22023'; END IF;
  SELECT * INTO m FROM public.meetings WHERE id=_meeting_id;
  IF m.id IS NULL THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;
  IF NOT public._school_can_manage_meeting(m.tenant_id, m.department, m.created_by, _uid) THEN
    RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  -- Idempotent: cùng cuộc họp + cùng tiêu đề = cùng chỉ đạo.
  SELECT id INTO _id FROM public.decisions WHERE source_id=_meeting_id AND source_type='MEETING' AND lower(btrim(title))=lower(_t) LIMIT 1;
  IF _id IS NOT NULL THEN
    UPDATE public.decisions SET status='CONFIRMED', confirmed_by=coalesce(confirmed_by,_uid), confirmed_at=coalesce(confirmed_at,now()), updated_by=_uid, row_version=row_version+1
     WHERE id=_id AND status='CANDIDATE';
    RETURN _id;
  END IF;
  -- Gán tổ cho cuộc họp nếu chưa có, để chỉ đạo hiện đúng trang Chỉ đạo của tổ.
  IF m.department IS NULL AND nullif(btrim(_department),'') IS NOT NULL THEN
    UPDATE public.meetings SET department=left(btrim(_department),120) WHERE id=m.id;
  END IF;
  INSERT INTO public.decisions(tenant_id, workspace_id, title, detail, status, origin, source_type, source_id, evidence, decided_at, decided_by, confirmed_by, confirmed_at, created_by, updated_by)
  VALUES (m.tenant_id, m.workspace_id, _t, nullif(left(coalesce(_detail,''),4000),''), 'CONFIRMED', 'MEETING', 'MEETING', m.id,
    CASE WHEN nullif(_evidence,'') IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('quote', left(_evidence,1000), 'source','minutes') END,
    coalesce(m.start_at, now()), _uid, _uid, now(), _uid, _uid)
  RETURNING id INTO _id;
  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (m.tenant_id, _uid, 'directive.recorded_from_minutes', 'decision', _id::text, jsonb_build_object('meeting_id', m.id), _correlation_id);
  PERFORM public._emit_outbox_event(m.tenant_id, 'directive.recorded_from_minutes.v1', 'decision', _id::text, jsonb_build_object('decision_id',_id,'meeting_id',m.id), _idempotency_key, _correlation_id);
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.school_record_minutes_decision(uuid,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_record_minutes_decision(uuid,text,text,text,text,text,text) TO authenticated;