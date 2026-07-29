
-- Helper: set app.correlation_id transaction-locally when provided.
CREATE OR REPLACE FUNCTION public._set_correlation_context(_correlation_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _correlation_id IS NOT NULL AND length(_correlation_id) > 0 THEN
    PERFORM set_config('app.correlation_id', _correlation_id, true);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._set_correlation_context(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._set_correlation_context(text) TO authenticated, service_role;

-- create_task
CREATE OR REPLACE FUNCTION public.create_task(_workspace_id uuid, _title text, _description text DEFAULT NULL::text, _priority task_priority DEFAULT 'normal'::task_priority, _due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _assignee_id uuid DEFAULT NULL::uuid, _idempotency_key text DEFAULT NULL::text, _correlation_id text DEFAULT NULL::text)
 RETURNS tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _actor uuid := auth.uid(); _tenant uuid; _task public.tasks;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  _tenant := public._resolve_workspace_tenant(_workspace_id);
  IF NOT public.check_quota(_tenant, 'tasks.active', 1) THEN
    PERFORM public._raise_quota_exceeded(_tenant, 'tasks.active', 1);
  END IF;
  INSERT INTO public.tasks(workspace_id, title, description, priority, due_at, created_by, updated_by)
  VALUES (_workspace_id, _title, _description, COALESCE(_priority,'normal'), _due_at, _actor, _actor)
  RETURNING * INTO _task;
  IF _assignee_id IS NOT NULL THEN
    INSERT INTO public.task_assignees(task_id, user_id, role, assigned_by)
    VALUES (_task.id, _assignee_id, 'assignee', _actor);
  END IF;
  PERFORM public.record_usage(_tenant, 'tasks.active', 1, _idempotency_key, _correlation_id, _workspace_id, '{}'::jsonb);
  PERFORM public._emit_outbox_event(_tenant, 'task.task.created', 'task', _task.id::text,
    jsonb_build_object('task_id', _task.id, 'workspace_id', _workspace_id, 'title', _title,
      'priority', _task.priority, 'assignee_id', _assignee_id, 'created_by', _actor),
    _idempotency_key, _correlation_id);
  RETURN _task;
END $function$;

-- create_document
CREATE OR REPLACE FUNCTION public.create_document(_workspace_id uuid, _title text, _folder text DEFAULT 'My Documents'::text, _tags text[] DEFAULT '{}'::text[], _storage_ref jsonb DEFAULT NULL::jsonb, _mime_type text DEFAULT NULL::text, _size_bytes bigint DEFAULT 0, _idempotency_key text DEFAULT NULL::text, _correlation_id text DEFAULT NULL::text)
 RETURNS documents LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _actor uuid := auth.uid(); _tenant uuid; _doc public.documents;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  _tenant := public._resolve_workspace_tenant(_workspace_id);
  IF COALESCE(_size_bytes,0) > 0 AND NOT public.check_quota(_tenant, 'documents.storage_bytes', _size_bytes) THEN
    PERFORM public._raise_quota_exceeded(_tenant, 'documents.storage_bytes', _size_bytes);
  END IF;
  INSERT INTO public.documents(workspace_id, title, folder, tags, storage_ref, mime_type, size_bytes, created_by, updated_by)
  VALUES (_workspace_id, _title, COALESCE(_folder,'My Documents'), COALESCE(_tags, '{}'::text[]),
    _storage_ref, _mime_type, _size_bytes, _actor, _actor)
  RETURNING * INTO _doc;
  INSERT INTO public.document_versions(document_id, version, storage_ref, mime_type, size_bytes, author_id, comment)
  VALUES (_doc.id, 1, _storage_ref, _mime_type, _size_bytes, _actor, 'initial');
  IF COALESCE(_size_bytes,0) > 0 THEN
    PERFORM public.record_usage(_tenant, 'documents.storage_bytes', _size_bytes, _idempotency_key, _correlation_id, _workspace_id, '{}'::jsonb);
  END IF;
  PERFORM public._emit_outbox_event(_tenant, 'document.document.created', 'document', _doc.id::text,
    jsonb_build_object('document_id', _doc.id, 'workspace_id', _workspace_id, 'folder', _doc.folder,
      'mime_type', _mime_type, 'size_bytes', _size_bytes),
    _idempotency_key, _correlation_id);
  RETURN _doc;
END $function$;

-- upload_document_version
CREATE OR REPLACE FUNCTION public.upload_document_version(_document_id uuid, _storage_ref jsonb, _mime_type text DEFAULT NULL::text, _size_bytes bigint DEFAULT 0, _comment text DEFAULT NULL::text, _idempotency_key text DEFAULT NULL::text, _correlation_id text DEFAULT NULL::text)
 RETURNS document_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _actor uuid := auth.uid(); _doc public.documents; _new_version bigint; _delta bigint; _v public.document_versions;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _doc FROM public.documents WHERE id = _document_id AND deleted_at IS NULL FOR UPDATE;
  IF _doc.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_doc.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  _delta := COALESCE(_size_bytes,0) - COALESCE(_doc.size_bytes,0);
  IF _delta > 0 AND NOT public.check_quota(_doc.tenant_id, 'documents.storage_bytes', _delta) THEN
    PERFORM public._raise_quota_exceeded(_doc.tenant_id, 'documents.storage_bytes', _delta);
  END IF;
  _new_version := _doc.current_version + 1;
  INSERT INTO public.document_versions(document_id, version, storage_ref, mime_type, size_bytes, author_id, comment)
  VALUES (_document_id, _new_version, _storage_ref, _mime_type, _size_bytes, _actor, _comment) RETURNING * INTO _v;
  UPDATE public.documents SET current_version = _new_version, storage_ref = _storage_ref,
    mime_type = _mime_type, size_bytes = _size_bytes, updated_by = _actor
  WHERE id = _document_id;
  IF _delta <> 0 THEN
    PERFORM public.record_usage(_doc.tenant_id, 'documents.storage_bytes', _delta, _idempotency_key, _correlation_id, _doc.workspace_id, '{}'::jsonb);
  END IF;
  PERFORM public._emit_outbox_event(_doc.tenant_id, 'document.document.version_uploaded', 'document', _doc.id::text,
    jsonb_build_object('document_id', _doc.id, 'version', _new_version, 'author_id', _actor, 'size_bytes', _size_bytes),
    _idempotency_key, _correlation_id);
  RETURN _v;
END $function$;

-- start_workflow_run
CREATE OR REPLACE FUNCTION public.start_workflow_run(_workflow_id uuid, _context jsonb DEFAULT '{}'::jsonb, _idempotency_key text DEFAULT NULL::text, _correlation_id text DEFAULT NULL::text)
 RETURNS workflow_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _actor uuid := auth.uid(); _wf public.workflows; _run public.workflow_runs;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _wf FROM public.workflows WHERE id = _workflow_id AND deleted_at IS NULL;
  IF _wf.id IS NULL THEN RAISE EXCEPTION 'WORKFLOW_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_wf.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF _wf.status <> 'published' THEN RAISE EXCEPTION 'WORKFLOW_NOT_PUBLISHED' USING ERRCODE='22023'; END IF;
  IF NOT public.check_quota(_wf.tenant_id, 'workflows.runs_per_month', 1) THEN
    PERFORM public._raise_quota_exceeded(_wf.tenant_id, 'workflows.runs_per_month', 1);
  END IF;
  INSERT INTO public.workflow_runs(workflow_id, workflow_version, status, context, started_at, correlation_id, triggered_by)
  VALUES (_workflow_id, _wf.version, 'running', COALESCE(_context,'{}'::jsonb), now(), _correlation_id, _actor)
  RETURNING * INTO _run;
  PERFORM public.record_usage(_wf.tenant_id, 'workflows.runs_per_month', 1, _idempotency_key, _correlation_id, _wf.workspace_id, '{}'::jsonb);
  PERFORM public._emit_outbox_event(_wf.tenant_id, 'workflow.run.started', 'workflow_run', _run.id::text,
    jsonb_build_object('run_id', _run.id, 'workflow_id', _wf.id, 'version', _wf.version, 'correlation_id', _correlation_id),
    _idempotency_key, _correlation_id);
  RETURN _run;
END $function$;

-- schedule_meeting (positional overload)
CREATE OR REPLACE FUNCTION public.schedule_meeting(_workspace_id uuid, _title text, _agenda text, _start_at timestamp with time zone, _end_at timestamp with time zone, _timezone text, _rrule text, _location text, _participant_ids uuid[], _idempotency_key text, _correlation_id text)
 RETURNS meetings LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _actor uuid := auth.uid(); _tenant uuid; _m public.meetings; _p uuid;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  _tenant := public._resolve_workspace_tenant(_workspace_id);
  IF _end_at <= _start_at THEN RAISE EXCEPTION 'MEETING_TIME_INVALID' USING ERRCODE='22023'; END IF;
  IF NOT public.check_quota(_tenant, 'meetings.scheduled_per_month', 1) THEN
    PERFORM public._raise_quota_exceeded(_tenant, 'meetings.scheduled_per_month', 1);
  END IF;
  INSERT INTO public.meetings(workspace_id, title, agenda, start_at, end_at, timezone, rrule, location, created_by, updated_by)
  VALUES (_workspace_id, _title, _agenda, _start_at, _end_at, COALESCE(_timezone,'UTC'), _rrule, _location, _actor, _actor)
  RETURNING * INTO _m;
  INSERT INTO public.meeting_participants(meeting_id, user_id, role) VALUES (_m.id, _actor, 'host') ON CONFLICT DO NOTHING;
  IF _participant_ids IS NOT NULL THEN
    FOREACH _p IN ARRAY _participant_ids LOOP
      INSERT INTO public.meeting_participants(meeting_id, user_id, role) VALUES (_m.id, _p, 'participant') ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  PERFORM public.record_usage(_tenant, 'meetings.scheduled_per_month', 1, _idempotency_key, _correlation_id, _workspace_id, '{}'::jsonb);
  PERFORM public._emit_outbox_event(_tenant, 'meeting.meeting.scheduled', 'meeting', _m.id::text,
    jsonb_build_object('meeting_id', _m.id, 'start_at', _m.start_at, 'end_at', _m.end_at, 'timezone', _m.timezone,
      'participants', COALESCE(_participant_ids, ARRAY[]::uuid[])),
    _idempotency_key, _correlation_id);
  RETURN _m;
END $function$;

-- schedule_meeting (named-defaults overload)
CREATE OR REPLACE FUNCTION public.schedule_meeting(_workspace_id uuid, _title text, _start_at timestamp with time zone, _end_at timestamp with time zone, _agenda text DEFAULT NULL::text, _timezone text DEFAULT 'UTC'::text, _rrule text DEFAULT NULL::text, _location text DEFAULT NULL::text, _participant_ids uuid[] DEFAULT NULL::uuid[], _idempotency_key text DEFAULT NULL::text, _correlation_id text DEFAULT NULL::text)
 RETURNS meetings LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _actor uuid := auth.uid(); _tenant uuid; _m public.meetings; _p uuid;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  _tenant := public._resolve_workspace_tenant(_workspace_id);
  IF _end_at <= _start_at THEN RAISE EXCEPTION 'MEETING_TIME_INVALID' USING ERRCODE='22023'; END IF;
  IF NOT public.check_quota(_tenant, 'meetings.scheduled_per_month', 1) THEN
    PERFORM public._raise_quota_exceeded(_tenant, 'meetings.scheduled_per_month', 1);
  END IF;
  INSERT INTO public.meetings(workspace_id, title, agenda, start_at, end_at, timezone, rrule, location, created_by, updated_by)
  VALUES (_workspace_id, _title, _agenda, _start_at, _end_at, COALESCE(_timezone,'UTC'), _rrule, _location, _actor, _actor)
  RETURNING * INTO _m;
  INSERT INTO public.meeting_participants(meeting_id, user_id, role) VALUES (_m.id, _actor, 'host') ON CONFLICT DO NOTHING;
  IF _participant_ids IS NOT NULL THEN
    FOREACH _p IN ARRAY _participant_ids LOOP
      INSERT INTO public.meeting_participants(meeting_id, user_id, role) VALUES (_m.id, _p, 'participant') ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  PERFORM public.record_usage(_tenant, 'meetings.scheduled_per_month', 1, _idempotency_key, _correlation_id, _workspace_id, '{}'::jsonb);
  PERFORM public._emit_outbox_event(_tenant, 'meeting.meeting.scheduled', 'meeting', _m.id::text,
    jsonb_build_object('meeting_id', _m.id, 'start_at', _m.start_at, 'end_at', _m.end_at, 'timezone', _m.timezone,
      'participants', COALESCE(_participant_ids, ARRAY[]::uuid[])),
    _idempotency_key, _correlation_id);
  RETURN _m;
END $function$;
