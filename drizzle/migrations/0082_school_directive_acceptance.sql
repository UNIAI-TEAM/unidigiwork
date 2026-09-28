ALTER TABLE public.decisions
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by uuid,
  ADD COLUMN IF NOT EXISTS acceptance_note text;

CREATE OR REPLACE FUNCTION public.school_review_directive(
  _decision_id uuid, _accept boolean, _note text, _idempotency_key text, _correlation_id text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); d public.decisions%ROWTYPE; _open int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT * INTO d FROM public.decisions WHERE id=_decision_id;
  IF d.id IS NULL THEN RAISE EXCEPTION 'DECISION_NOT_FOUND' USING ERRCODE='02000'; END IF;
  IF NOT public._school_is_bgh(d.tenant_id,_uid) THEN RAISE EXCEPTION 'DIRECTIVE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
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
    'decision', d.id::text, jsonb_build_object('note',left(coalesce(_note,''),2000),'source','school'), _correlation_id);
  PERFORM public._emit_outbox_event(d.tenant_id, CASE WHEN _accept THEN 'directive.accepted.v1' ELSE 'directive.revision_requested.v1' END,
    'decision', d.id::text, jsonb_build_object('decision_id',d.id), _idempotency_key, _correlation_id);
  RETURN d.id;
END $$;
REVOKE ALL ON FUNCTION public.school_review_directive(uuid,boolean,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_review_directive(uuid,boolean,text,text,text) TO authenticated;