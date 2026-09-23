CREATE OR REPLACE FUNCTION public.create_conversation_import(
  _tenant_id uuid,
  _workspace_id uuid,
  _source_channel text,
  _source_group_name text,
  _shared_by_label text,
  _original_at timestamptz,
  _visibility text,
  _notes text,
  _fingerprint text,
  _messages jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing public.conversation_imports;
  _import_id uuid;
  _count integer := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
  IF NOT public.is_tenant_member(_tenant_id) THEN
    RAISE EXCEPTION 'TENANT_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(_messages) <> 'array' OR jsonb_array_length(_messages) = 0 THEN
    RAISE EXCEPTION 'IMPORT_EMPTY' USING ERRCODE='22023';
  END IF;

  SELECT * INTO _existing FROM public.conversation_imports
  WHERE tenant_id = _tenant_id AND fingerprint = _fingerprint;
  IF _existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('importId', _existing.id, 'duplicate', true,
                              'messageCount', _existing.message_count);
  END IF;

  INSERT INTO public.conversation_imports(
    tenant_id, workspace_id, source_channel, source_group_name, shared_by_label,
    original_at, visibility, notes, fingerprint, imported_by, created_by, updated_by)
  VALUES (_tenant_id, _workspace_id, _source_channel, _source_group_name,
          nullif(btrim(coalesce(_shared_by_label,'')), ''), _original_at,
          coalesce(_visibility,'TENANT'), nullif(btrim(coalesce(_notes,'')), ''),
          _fingerprint, _uid, _uid, _uid)
  RETURNING id INTO _import_id;

  INSERT INTO public.conversation_import_messages(tenant_id, import_id, seq, author_label, sent_at, body, attachments)
  SELECT _tenant_id, _import_id, (ord - 1)::int,
         coalesce(nullif(btrim(m->>'authorLabel'), ''), 'Không rõ'),
         nullif(m->>'sentAt','')::timestamptz,
         coalesce(m->>'body',''),
         coalesce(m->'attachments', '[]'::jsonb)
  FROM jsonb_array_elements(_messages) WITH ORDINALITY AS t(m, ord);

  SELECT count(*) INTO _count FROM public.conversation_import_messages WHERE import_id = _import_id;
  UPDATE public.conversation_imports SET message_count = _count, updated_at = now() WHERE id = _import_id;

  INSERT INTO public.audit_events(tenant_id, actor_user_id, action, resource_type, resource_id, payload)
  VALUES (_tenant_id, _uid, 'CONVERSATION_IMPORT_CREATED', 'CONVERSATION_IMPORT', _import_id,
          jsonb_build_object('channel', _source_channel, 'group', _source_group_name, 'messages', _count));

  RETURN jsonb_build_object('importId', _import_id, 'duplicate', false, 'messageCount', _count);
END $$;

CREATE OR REPLACE FUNCTION public.record_extraction_run(
  _tenant_id uuid,
  _source_type text,
  _source_id uuid,
  _workspace_id uuid,
  _idempotency_key text,
  _model text,
  _proposals jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _run_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
  IF NOT public.is_tenant_member(_tenant_id) THEN
    RAISE EXCEPTION 'TENANT_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF NOT public.can_access_conversation_source(_source_type, _source_id) THEN
    RAISE EXCEPTION 'CONVERSATION_FORBIDDEN' USING ERRCODE='42501';
  END IF;

  SELECT id INTO _run_id FROM public.work_extraction_runs
  WHERE tenant_id = _tenant_id AND idempotency_key = _idempotency_key;
  IF _run_id IS NOT NULL THEN
    RETURN jsonb_build_object('runId', _run_id, 'duplicate', true);
  END IF;

  INSERT INTO public.work_extraction_runs(
    tenant_id, source_type, source_id, workspace_id, idempotency_key, model, requested_by)
  VALUES (_tenant_id, _source_type, _source_id, _workspace_id, _idempotency_key, _model, _uid)
  RETURNING id INTO _run_id;

  INSERT INTO public.work_extraction_proposals(
    tenant_id, run_id, kind, title, description, evidence, evidence_ref, confidence,
    missing_fields, created_by, updated_by)
  SELECT _tenant_id, _run_id,
         upper(coalesce(p->>'kind','TASK')),
         left(coalesce(nullif(btrim(p->>'title'),''), 'Không có tiêu đề'), 500),
         nullif(btrim(coalesce(p->>'description','')), ''),
         coalesce(p->>'evidence',''),
         coalesce(p->'evidenceRef', '{}'::jsonb),
         least(greatest(coalesce((p->>'confidence')::numeric, 0.5), 0), 1),
         coalesce((SELECT array_agg(value::text) FROM jsonb_array_elements_text(coalesce(p->'missingFields','[]'::jsonb))), '{}'),
         _uid, _uid
  FROM jsonb_array_elements(coalesce(_proposals,'[]'::jsonb)) AS p
  WHERE upper(coalesce(p->>'kind','TASK')) IN ('TASK','DECISION','COMMITMENT','KNOWLEDGE');

  INSERT INTO public.audit_events(tenant_id, actor_user_id, action, resource_type, resource_id, payload)
  VALUES (_tenant_id, _uid, 'WORK_EXTRACTION_RUN', 'EXTRACTION_RUN', _run_id,
          jsonb_build_object('sourceType', _source_type, 'sourceId', _source_id));

  RETURN jsonb_build_object('runId', _run_id, 'duplicate', false);
END $$;

CREATE OR REPLACE FUNCTION public.approve_extraction_proposal(
  _proposal_id uuid,
  _entity_type text,
  _entity_id uuid,
  _excerpt text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _p public.work_extraction_proposals;
  _run public.work_extraction_runs;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
  SELECT * INTO _p FROM public.work_extraction_proposals WHERE id = _proposal_id;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'PROPOSAL_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_p.tenant_id) THEN
    RAISE EXCEPTION 'TENANT_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF _p.status = 'APPROVED' THEN
    RETURN jsonb_build_object('proposalId', _p.id, 'duplicate', true,
                              'entityId', _p.created_entity_id);
  END IF;

  SELECT * INTO _run FROM public.work_extraction_runs WHERE id = _p.run_id;

  UPDATE public.work_extraction_proposals
  SET status = 'APPROVED', created_entity_type = _entity_type, created_entity_id = _entity_id,
      approved_by = _uid, approved_at = now(), updated_by = _uid, updated_at = now()
  WHERE id = _proposal_id;

  INSERT INTO public.work_source_citations(
    tenant_id, entity_type, entity_id, source_type, source_id, excerpt, proposal_id, created_by)
  VALUES (_p.tenant_id, _entity_type, _entity_id, _run.source_type, _run.source_id,
          coalesce(nullif(btrim(_excerpt),''), _p.evidence), _p.id, _uid);

  INSERT INTO public.audit_events(tenant_id, actor_user_id, action, resource_type, resource_id, payload)
  VALUES (_p.tenant_id, _uid, 'WORK_EXTRACTION_APPROVED', _entity_type, _entity_id,
          jsonb_build_object('proposalId', _p.id, 'sourceType', _run.source_type, 'sourceId', _run.source_id));

  RETURN jsonb_build_object('proposalId', _p.id, 'duplicate', false, 'entityId', _entity_id);
END $$;