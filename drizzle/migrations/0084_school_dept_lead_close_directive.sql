CREATE OR REPLACE FUNCTION public._school_directive_sole_dept(_decision_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH d AS (SELECT tenant_id, source_id FROM public.decisions WHERE id=_decision_id),
  me AS (SELECT p.department FROM d JOIN public.tenant_members m ON m.tenant_id=d.tenant_id AND m.user_id=_uid AND m.status='active' AND m.role='manager'
         JOIN public.tenant_member_profiles p ON p.tenant_id=d.tenant_id AND p.user_id=_uid WHERE p.department IS NOT NULL),
  ts AS (SELECT t.human_owner_id FROM d JOIN public.meeting_action_item_states s ON s.meeting_id=d.source_id JOIN public.tasks t ON t.id=s.task_id)
  SELECT EXISTS (SELECT 1 FROM me) AND EXISTS (SELECT 1 FROM ts) AND NOT EXISTS (
    SELECT 1 FROM ts, d, me WHERE ts.human_owner_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.tenant_member_profiles q WHERE q.tenant_id=d.tenant_id AND q.user_id=ts.human_owner_id AND q.department=me.department))
$$;
REVOKE ALL ON FUNCTION public._school_directive_sole_dept(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._school_directive_sole_dept(uuid,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.school_review_directive(
  _decision_id uuid, _accept boolean, _note text, _idempotency_key text, _correlation_id text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); d public.decisions%ROWTYPE; _open int; _bgh boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT * INTO d FROM public.decisions WHERE id=_decision_id;
  IF d.id IS NULL THEN RAISE EXCEPTION 'DECISION_NOT_FOUND' USING ERRCODE='02000'; END IF;
  _bgh := public._school_is_bgh(d.tenant_id,_uid);
  IF NOT _bgh AND NOT public._school_directive_sole_dept(d.id,_uid) THEN RAISE EXCEPTION 'DIRECTIVE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF d.status <> 'CONFIRMED' THEN RAISE EXCEPTION 'DIRECTIVE_NOT_CONFIRMED' USING ERRCODE='22023'; END IF;
  IF _accept AND d.accepted_at IS NOT NULL THEN RETURN d.id; END IF;
  IF _accept THEN
    SELECT count(*) INTO _open FROM public.meeting_action_item_states s JOIN public.tasks t ON t.id=s.task_id
     WHERE s.meeting_id=d.source_id AND t.status NOT IN ('done','canceled');
    IF _open > 0 THEN RAISE EXCEPTION 'DIRECTIVE_TASKS_OPEN' USING ERRCODE='22023'; END IF;
  END IF;
  UPDATE public.decisions SET
    accepted_at = CASE WHEN _accept THEN now() ELSE NULL END,
    accepted_by = CASE WHEN _accept THEN _uid ELSE NULL END,
    acceptance_note = left(coalesce(_note,''),2000),
    updated_by=_uid, row_version=row_version+1
   WHERE id=_decision_id;
  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (d.tenant_id,_uid, CASE WHEN _accept THEN 'directive.accepted' ELSE 'directive.revision_requested' END,
    'decision', d.id::text, jsonb_build_object('note',left(coalesce(_note,''),2000),'source','school','by', CASE WHEN _bgh THEN 'bgh' ELSE 'dept_lead' END), _correlation_id);
  PERFORM public._emit_outbox_event(d.tenant_id, CASE WHEN _accept THEN 'directive.accepted.v1' ELSE 'directive.revision_requested.v1' END,
    'decision', d.id::text, jsonb_build_object('decision_id',d.id), _idempotency_key, _correlation_id);
  RETURN d.id;
END $$;