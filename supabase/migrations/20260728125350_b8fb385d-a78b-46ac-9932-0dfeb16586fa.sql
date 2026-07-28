
-- =====================================================================
-- Batch 1D-API — Business Domain RPCs (Tasks, Documents, Meetings, Workflows)
-- All functions: SECURITY DEFINER, search_path=public, auth.uid() as actor
-- =====================================================================

-- ---------- Outbox emit helper ---------------------------------------
CREATE OR REPLACE FUNCTION public._emit_outbox_event(
  _tenant_id uuid,
  _event_type text,
  _aggregate_type text,
  _aggregate_id text,
  _payload jsonb,
  _idempotency_key text DEFAULT NULL,
  _correlation_id text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.outbox_events(
    tenant_id, event_type, aggregate_type, aggregate_id, payload,
    idempotency_key, correlation_id
  ) VALUES (
    _tenant_id, _event_type, _aggregate_type, _aggregate_id, _payload,
    _idempotency_key, _correlation_id
  )
  ON CONFLICT (event_type, idempotency_key) DO UPDATE SET event_type = EXCLUDED.event_type
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public._emit_outbox_event(uuid,text,text,text,jsonb,text,text) FROM PUBLIC;

-- Helper: resolve tenant from workspace and assert membership
CREATE OR REPLACE FUNCTION public._resolve_workspace_tenant(_workspace_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tenant uuid;
BEGIN
  SELECT tenant_id INTO _tenant FROM public.workspaces WHERE id = _workspace_id AND deleted_at IS NULL;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'RESOURCE_NOT_FOUND: workspace' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_tenant_member(_tenant) THEN
    RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN _tenant;
END $$;
REVOKE ALL ON FUNCTION public._resolve_workspace_tenant(uuid) FROM PUBLIC;

-- =====================================================================
-- TASKS (5 RPCs)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_task(
  _workspace_id uuid, _title text, _description text,
  _priority task_priority, _due_at timestamptz, _assignee_id uuid,
  _idempotency_key text, _correlation_id text
) RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _tenant uuid; _task public.tasks;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  _tenant := public._resolve_workspace_tenant(_workspace_id);
  IF NOT public.check_quota(_tenant, 'tasks.active', 1) THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED: tasks.active' USING ERRCODE='53400';
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
END $$;

CREATE OR REPLACE FUNCTION public.update_task(
  _task_id uuid, _title text, _description text, _priority task_priority,
  _due_at timestamptz, _expected_row_version bigint,
  _idempotency_key text, _correlation_id text
) RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _task public.tasks;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _task FROM public.tasks WHERE id = _task_id AND deleted_at IS NULL;
  IF _task.id IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_task.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF _expected_row_version IS NOT NULL AND _task.row_version <> _expected_row_version THEN
    RAISE EXCEPTION 'TASK_VERSION_CONFLICT' USING ERRCODE='40001';
  END IF;

  UPDATE public.tasks SET
    title = COALESCE(_title, title),
    description = COALESCE(_description, description),
    priority = COALESCE(_priority, priority),
    due_at = COALESCE(_due_at, due_at),
    updated_by = _actor
  WHERE id = _task_id RETURNING * INTO _task;

  PERFORM public._emit_outbox_event(_task.tenant_id, 'task.task.updated', 'task', _task.id::text,
    jsonb_build_object('task_id', _task.id, 'actor_id', _actor, 'row_version', _task.row_version),
    _idempotency_key, _correlation_id);
  RETURN _task;
END $$;

CREATE OR REPLACE FUNCTION public.transition_task(
  _task_id uuid, _to_status task_status, _expected_row_version bigint,
  _idempotency_key text, _correlation_id text
) RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _task public.tasks; _from task_status; _valid boolean;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _task FROM public.tasks WHERE id = _task_id AND deleted_at IS NULL;
  IF _task.id IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_task.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF _expected_row_version IS NOT NULL AND _task.row_version <> _expected_row_version THEN
    RAISE EXCEPTION 'TASK_VERSION_CONFLICT' USING ERRCODE='40001';
  END IF;
  _from := _task.status;
  -- transition matrix: any -> canceled; done is terminal (except -> todo reopen)
  _valid := CASE
    WHEN _from = _to_status THEN true
    WHEN _to_status = 'canceled' THEN _from <> 'done'
    WHEN _from = 'todo' AND _to_status IN ('in_progress','blocked') THEN true
    WHEN _from = 'in_progress' AND _to_status IN ('todo','blocked','done') THEN true
    WHEN _from = 'blocked' AND _to_status IN ('todo','in_progress') THEN true
    WHEN _from = 'done' AND _to_status = 'todo' THEN true
    WHEN _from = 'canceled' AND _to_status = 'todo' THEN true
    ELSE false END;
  IF NOT _valid THEN RAISE EXCEPTION 'TASK_INVALID_TRANSITION: % -> %', _from, _to_status USING ERRCODE='22023'; END IF;

  UPDATE public.tasks SET status = _to_status,
    completed_at = CASE WHEN _to_status='done' THEN now() ELSE NULL END,
    updated_by = _actor
  WHERE id = _task_id RETURNING * INTO _task;

  -- quota gauge: adjust tasks.active when leaving/entering non-active state
  IF _from IN ('todo','in_progress','blocked') AND _to_status IN ('done','canceled') THEN
    PERFORM public.record_usage(_task.tenant_id, 'tasks.active', -1, _idempotency_key, _correlation_id, _task.workspace_id, jsonb_build_object('reason','completed_or_canceled'));
  ELSIF _from IN ('done','canceled') AND _to_status IN ('todo','in_progress','blocked') THEN
    PERFORM public.record_usage(_task.tenant_id, 'tasks.active', 1, _idempotency_key, _correlation_id, _task.workspace_id, jsonb_build_object('reason','reopened'));
  END IF;

  PERFORM public._emit_outbox_event(_task.tenant_id, 'task.task.transitioned', 'task', _task.id::text,
    jsonb_build_object('task_id', _task.id, 'from_status', _from, 'to_status', _to_status, 'actor_id', _actor),
    _idempotency_key, _correlation_id);
  RETURN _task;
END $$;

CREATE OR REPLACE FUNCTION public.assign_task(
  _task_id uuid, _assignee_id uuid, _role text,
  _idempotency_key text, _correlation_id text
) RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _task public.tasks;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _task FROM public.tasks WHERE id = _task_id AND deleted_at IS NULL;
  IF _task.id IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_task.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT public.is_workspace_member(_task.workspace_id, _assignee_id) THEN
    RAISE EXCEPTION 'TASK_ASSIGNEE_INVALID' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.task_assignees(task_id, user_id, role, assigned_by)
  VALUES (_task_id, _assignee_id, COALESCE(_role,'assignee'), _actor)
  ON CONFLICT (task_id, user_id) DO UPDATE SET role = EXCLUDED.role, assigned_by = _actor, assigned_at = now();

  PERFORM public._emit_outbox_event(_task.tenant_id, 'task.task.assigned', 'task', _task.id::text,
    jsonb_build_object('task_id', _task.id, 'assignee_id', _assignee_id, 'role', COALESCE(_role,'assignee'), 'actor_id', _actor),
    _idempotency_key, _correlation_id);
  RETURN _task;
END $$;

CREATE OR REPLACE FUNCTION public.comment_task(
  _task_id uuid, _body text, _idempotency_key text, _correlation_id text
) RETURNS public.task_comments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _task public.tasks; _c public.task_comments;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _task FROM public.tasks WHERE id = _task_id AND deleted_at IS NULL;
  IF _task.id IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_task.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

  INSERT INTO public.task_comments(task_id, author_id, body) VALUES (_task_id, _actor, _body) RETURNING * INTO _c;

  PERFORM public._emit_outbox_event(_task.tenant_id, 'task.task.commented', 'task', _task.id::text,
    jsonb_build_object('task_id', _task.id, 'comment_id', _c.id, 'author_id', _actor),
    _idempotency_key, _correlation_id);
  RETURN _c;
END $$;

-- =====================================================================
-- DOCUMENTS (5 RPCs)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_document(
  _workspace_id uuid, _title text, _folder text, _tags text[],
  _storage_ref jsonb, _mime_type text, _size_bytes bigint,
  _idempotency_key text, _correlation_id text
) RETURNS public.documents
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _tenant uuid; _doc public.documents;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  _tenant := public._resolve_workspace_tenant(_workspace_id);
  IF COALESCE(_size_bytes,0) > 0 AND NOT public.check_quota(_tenant, 'documents.storage_bytes', _size_bytes) THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED: documents.storage_bytes' USING ERRCODE='53400';
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
END $$;

CREATE OR REPLACE FUNCTION public.update_document(
  _document_id uuid, _title text, _folder text, _tags text[],
  _expected_row_version bigint, _idempotency_key text, _correlation_id text
) RETURNS public.documents
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _doc public.documents;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _doc FROM public.documents WHERE id = _document_id AND deleted_at IS NULL;
  IF _doc.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_doc.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF _expected_row_version IS NOT NULL AND _doc.row_version <> _expected_row_version THEN
    RAISE EXCEPTION 'DOCUMENT_VERSION_CONFLICT' USING ERRCODE='40001';
  END IF;

  UPDATE public.documents SET
    title = COALESCE(_title, title),
    folder = COALESCE(_folder, folder),
    tags = COALESCE(_tags, tags),
    updated_by = _actor
  WHERE id = _document_id RETURNING * INTO _doc;

  PERFORM public._emit_outbox_event(_doc.tenant_id, 'document.document.updated', 'document', _doc.id::text,
    jsonb_build_object('document_id', _doc.id, 'actor_id', _actor, 'row_version', _doc.row_version),
    _idempotency_key, _correlation_id);
  RETURN _doc;
END $$;

CREATE OR REPLACE FUNCTION public.upload_document_version(
  _document_id uuid, _storage_ref jsonb, _mime_type text, _size_bytes bigint, _comment text,
  _idempotency_key text, _correlation_id text
) RETURNS public.document_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _doc public.documents; _new_version bigint; _delta bigint; _v public.document_versions;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _doc FROM public.documents WHERE id = _document_id AND deleted_at IS NULL FOR UPDATE;
  IF _doc.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_doc.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

  _delta := COALESCE(_size_bytes,0) - COALESCE(_doc.size_bytes,0);
  IF _delta > 0 AND NOT public.check_quota(_doc.tenant_id, 'documents.storage_bytes', _delta) THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED: documents.storage_bytes' USING ERRCODE='53400';
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
END $$;

CREATE OR REPLACE FUNCTION public.share_document(
  _document_id uuid, _principal_type text, _principal_id uuid, _level text,
  _idempotency_key text, _correlation_id text
) RETURNS public.document_permissions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _doc public.documents; _perm public.document_permissions;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _doc FROM public.documents WHERE id = _document_id AND deleted_at IS NULL;
  IF _doc.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_doc.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF _principal_type NOT IN ('user','workspace','tenant') THEN RAISE EXCEPTION 'VALIDATION_FAILED: principal_type' USING ERRCODE='22023'; END IF;
  IF _level NOT IN ('view','comment','edit','manage') THEN RAISE EXCEPTION 'VALIDATION_FAILED: level' USING ERRCODE='22023'; END IF;

  INSERT INTO public.document_permissions(document_id, principal_type, principal_id, level, granted_by)
  VALUES (_document_id, _principal_type, _principal_id, _level, _actor)
  ON CONFLICT (document_id, principal_type, principal_id)
    DO UPDATE SET level = EXCLUDED.level, granted_by = _actor, updated_at = now()
  RETURNING * INTO _perm;

  PERFORM public._emit_outbox_event(_doc.tenant_id, 'document.document.shared', 'document', _doc.id::text,
    jsonb_build_object('document_id', _doc.id, 'principal_type', _principal_type, 'principal_id', _principal_id, 'level', _level),
    _idempotency_key, _correlation_id);
  RETURN _perm;
END $$;

CREATE OR REPLACE FUNCTION public.archive_document(
  _document_id uuid, _expected_row_version bigint,
  _idempotency_key text, _correlation_id text
) RETURNS public.documents
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _doc public.documents;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _doc FROM public.documents WHERE id = _document_id AND deleted_at IS NULL;
  IF _doc.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_doc.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF _expected_row_version IS NOT NULL AND _doc.row_version <> _expected_row_version THEN
    RAISE EXCEPTION 'DOCUMENT_VERSION_CONFLICT' USING ERRCODE='40001';
  END IF;

  UPDATE public.documents SET deleted_at = now(), updated_by = _actor
  WHERE id = _document_id RETURNING * INTO _doc;

  IF COALESCE(_doc.size_bytes,0) > 0 THEN
    PERFORM public.record_usage(_doc.tenant_id, 'documents.storage_bytes', -_doc.size_bytes, _idempotency_key, _correlation_id, _doc.workspace_id, jsonb_build_object('reason','archived'));
  END IF;
  PERFORM public._emit_outbox_event(_doc.tenant_id, 'document.document.archived', 'document', _doc.id::text,
    jsonb_build_object('document_id', _doc.id, 'actor_id', _actor), _idempotency_key, _correlation_id);
  RETURN _doc;
END $$;

-- =====================================================================
-- MEETINGS (4 RPCs)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.schedule_meeting(
  _workspace_id uuid, _title text, _agenda text,
  _start_at timestamptz, _end_at timestamptz, _timezone text, _rrule text, _location text,
  _participant_ids uuid[], _idempotency_key text, _correlation_id text
) RETURNS public.meetings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _tenant uuid; _m public.meetings; _p uuid;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  _tenant := public._resolve_workspace_tenant(_workspace_id);
  IF _end_at <= _start_at THEN RAISE EXCEPTION 'MEETING_TIME_INVALID' USING ERRCODE='22023'; END IF;
  IF NOT public.check_quota(_tenant, 'meetings.scheduled_per_month', 1) THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED: meetings.scheduled_per_month' USING ERRCODE='53400';
  END IF;

  INSERT INTO public.meetings(workspace_id, title, agenda, start_at, end_at, timezone, rrule, location, created_by, updated_by)
  VALUES (_workspace_id, _title, _agenda, _start_at, _end_at, COALESCE(_timezone,'UTC'), _rrule, _location, _actor, _actor)
  RETURNING * INTO _m;

  INSERT INTO public.meeting_participants(meeting_id, user_id, role) VALUES (_m.id, _actor, 'host')
  ON CONFLICT DO NOTHING;
  IF _participant_ids IS NOT NULL THEN
    FOREACH _p IN ARRAY _participant_ids LOOP
      INSERT INTO public.meeting_participants(meeting_id, user_id, role) VALUES (_m.id, _p, 'participant')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  PERFORM public.record_usage(_tenant, 'meetings.scheduled_per_month', 1, _idempotency_key, _correlation_id, _workspace_id, '{}'::jsonb);
  PERFORM public._emit_outbox_event(_tenant, 'meeting.meeting.scheduled', 'meeting', _m.id::text,
    jsonb_build_object('meeting_id', _m.id, 'start_at', _m.start_at, 'end_at', _m.end_at, 'timezone', _m.timezone,
      'participants', COALESCE(_participant_ids, ARRAY[]::uuid[])),
    _idempotency_key, _correlation_id);
  RETURN _m;
END $$;

CREATE OR REPLACE FUNCTION public.update_meeting(
  _meeting_id uuid, _title text, _agenda text, _start_at timestamptz, _end_at timestamptz,
  _timezone text, _location text, _expected_row_version bigint,
  _idempotency_key text, _correlation_id text
) RETURNS public.meetings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _m public.meetings;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF _m.id IS NULL THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_m.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF _expected_row_version IS NOT NULL AND _m.row_version <> _expected_row_version THEN
    RAISE EXCEPTION 'MEETING_VERSION_CONFLICT' USING ERRCODE='40001';
  END IF;
  IF COALESCE(_end_at, _m.end_at) <= COALESCE(_start_at, _m.start_at) THEN
    RAISE EXCEPTION 'MEETING_TIME_INVALID' USING ERRCODE='22023';
  END IF;

  UPDATE public.meetings SET
    title = COALESCE(_title, title), agenda = COALESCE(_agenda, agenda),
    start_at = COALESCE(_start_at, start_at), end_at = COALESCE(_end_at, end_at),
    timezone = COALESCE(_timezone, timezone), location = COALESCE(_location, location),
    updated_by = _actor
  WHERE id = _meeting_id RETURNING * INTO _m;

  PERFORM public._emit_outbox_event(_m.tenant_id, 'meeting.meeting.updated', 'meeting', _m.id::text,
    jsonb_build_object('meeting_id', _m.id, 'actor_id', _actor, 'row_version', _m.row_version),
    _idempotency_key, _correlation_id);
  RETURN _m;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_meeting(
  _meeting_id uuid, _reason text, _expected_row_version bigint,
  _idempotency_key text, _correlation_id text
) RETURNS public.meetings
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _m public.meetings;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF _m.id IS NULL THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_m.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF _expected_row_version IS NOT NULL AND _m.row_version <> _expected_row_version THEN
    RAISE EXCEPTION 'MEETING_VERSION_CONFLICT' USING ERRCODE='40001';
  END IF;

  UPDATE public.meetings SET status = 'canceled', deleted_at = now(), updated_by = _actor
  WHERE id = _meeting_id RETURNING * INTO _m;

  PERFORM public._emit_outbox_event(_m.tenant_id, 'meeting.meeting.canceled', 'meeting', _m.id::text,
    jsonb_build_object('meeting_id', _m.id, 'reason', _reason, 'actor_id', _actor),
    _idempotency_key, _correlation_id);
  RETURN _m;
END $$;

CREATE OR REPLACE FUNCTION public.set_meeting_rsvp(
  _meeting_id uuid, _rsvp meeting_rsvp,
  _idempotency_key text, _correlation_id text
) RETURNS public.meeting_participants
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _m public.meetings; _mp public.meeting_participants;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF _m.id IS NULL THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_m.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.meeting_participants WHERE meeting_id=_meeting_id AND user_id=_actor) THEN
    RAISE EXCEPTION 'MEETING_RSVP_FORBIDDEN' USING ERRCODE='42501';
  END IF;

  UPDATE public.meeting_participants SET rsvp = _rsvp, rsvp_at = now()
  WHERE meeting_id = _meeting_id AND user_id = _actor RETURNING * INTO _mp;

  PERFORM public._emit_outbox_event(_m.tenant_id, 'meeting.participant.rsvp_changed', 'meeting_participant', _m.id::text,
    jsonb_build_object('meeting_id', _m.id, 'user_id', _actor, 'rsvp', _rsvp),
    _idempotency_key, _correlation_id);
  RETURN _mp;
END $$;

-- =====================================================================
-- WORKFLOWS (4 RPCs)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_workflow(
  _workspace_id uuid, _name text, _description text, _definition jsonb,
  _idempotency_key text, _correlation_id text
) RETURNS public.workflows
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _tenant uuid; _wf public.workflows;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  _tenant := public._resolve_workspace_tenant(_workspace_id);
  IF _definition IS NULL OR jsonb_typeof(_definition) <> 'object' THEN
    RAISE EXCEPTION 'WORKFLOW_DEFINITION_INVALID' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.workflows(workspace_id, name, description, definition, created_by, updated_by)
  VALUES (_workspace_id, _name, _description, _definition, _actor, _actor)
  RETURNING * INTO _wf;

  PERFORM public._emit_outbox_event(_tenant, 'workflow.workflow.created', 'workflow', _wf.id::text,
    jsonb_build_object('workflow_id', _wf.id, 'workspace_id', _workspace_id, 'created_by', _actor),
    _idempotency_key, _correlation_id);
  RETURN _wf;
END $$;

CREATE OR REPLACE FUNCTION public.publish_workflow(
  _workflow_id uuid, _expected_row_version bigint,
  _idempotency_key text, _correlation_id text
) RETURNS public.workflows
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _wf public.workflows;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _wf FROM public.workflows WHERE id = _workflow_id AND deleted_at IS NULL;
  IF _wf.id IS NULL THEN RAISE EXCEPTION 'WORKFLOW_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_wf.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF _wf.status = 'published' THEN RAISE EXCEPTION 'WORKFLOW_ALREADY_PUBLISHED' USING ERRCODE='22023'; END IF;
  IF _expected_row_version IS NOT NULL AND _wf.row_version <> _expected_row_version THEN
    RAISE EXCEPTION 'WORKFLOW_VERSION_CONFLICT' USING ERRCODE='40001';
  END IF;

  UPDATE public.workflows SET status = 'published', published_at = now(), version = _wf.version + 1, updated_by = _actor
  WHERE id = _workflow_id RETURNING * INTO _wf;

  PERFORM public._emit_outbox_event(_wf.tenant_id, 'workflow.workflow.published', 'workflow', _wf.id::text,
    jsonb_build_object('workflow_id', _wf.id, 'version', _wf.version, 'actor_id', _actor),
    _idempotency_key, _correlation_id);
  RETURN _wf;
END $$;

CREATE OR REPLACE FUNCTION public.start_workflow_run(
  _workflow_id uuid, _context jsonb, _idempotency_key text, _correlation_id text
) RETURNS public.workflow_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _wf public.workflows; _run public.workflow_runs;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _wf FROM public.workflows WHERE id = _workflow_id AND deleted_at IS NULL;
  IF _wf.id IS NULL THEN RAISE EXCEPTION 'WORKFLOW_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_wf.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF _wf.status <> 'published' THEN RAISE EXCEPTION 'WORKFLOW_NOT_PUBLISHED' USING ERRCODE='22023'; END IF;
  IF NOT public.check_quota(_wf.tenant_id, 'workflows.runs_per_month', 1) THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED: workflows.runs_per_month' USING ERRCODE='53400';
  END IF;

  INSERT INTO public.workflow_runs(workflow_id, workflow_version, status, context, started_at, correlation_id, triggered_by)
  VALUES (_workflow_id, _wf.version, 'running', COALESCE(_context,'{}'::jsonb), now(), _correlation_id, _actor)
  RETURNING * INTO _run;

  PERFORM public.record_usage(_wf.tenant_id, 'workflows.runs_per_month', 1, _idempotency_key, _correlation_id, _wf.workspace_id, '{}'::jsonb);
  PERFORM public._emit_outbox_event(_wf.tenant_id, 'workflow.run.started', 'workflow_run', _run.id::text,
    jsonb_build_object('run_id', _run.id, 'workflow_id', _wf.id, 'version', _wf.version, 'correlation_id', _correlation_id),
    _idempotency_key, _correlation_id);
  RETURN _run;
END $$;

CREATE OR REPLACE FUNCTION public.advance_workflow_step(
  _run_id uuid, _step_key text, _to_status workflow_step_status,
  _input jsonb, _output jsonb, _error text,
  _idempotency_key text, _correlation_id text
) RETURNS public.workflow_steps
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _run public.workflow_runs; _step public.workflow_steps; _from workflow_step_status;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _run FROM public.workflow_runs WHERE id = _run_id;
  IF _run.id IS NULL THEN RAISE EXCEPTION 'WORKFLOW_RUN_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_run.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

  SELECT * INTO _step FROM public.workflow_steps WHERE run_id = _run_id AND step_key = _step_key;
  IF _step.id IS NULL THEN
    INSERT INTO public.workflow_steps(run_id, step_key, status, input,
      started_at, ended_at, output, error)
    VALUES (_run_id, _step_key, _to_status, COALESCE(_input,'{}'::jsonb),
      CASE WHEN _to_status IN ('running','succeeded','failed','skipped') THEN now() END,
      CASE WHEN _to_status IN ('succeeded','failed','skipped') THEN now() END,
      _output, _error)
    RETURNING * INTO _step;
  ELSE
    _from := _step.status;
    UPDATE public.workflow_steps SET status = _to_status,
      output = COALESCE(_output, output), error = COALESCE(_error, error),
      started_at = COALESCE(started_at, CASE WHEN _to_status='running' THEN now() END),
      ended_at = CASE WHEN _to_status IN ('succeeded','failed','skipped') THEN now() ELSE ended_at END
    WHERE id = _step.id RETURNING * INTO _step;
  END IF;

  PERFORM public._emit_outbox_event(_run.tenant_id, 'workflow.step.advanced', 'workflow_step', _run.id::text,
    jsonb_build_object('run_id', _run.id, 'step_key', _step_key, 'to_status', _to_status),
    _idempotency_key, _correlation_id);
  RETURN _step;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_workflow_run(
  _run_id uuid, _reason text, _idempotency_key text, _correlation_id text
) RETURNS public.workflow_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _run public.workflow_runs;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _run FROM public.workflow_runs WHERE id = _run_id;
  IF _run.id IS NULL THEN RAISE EXCEPTION 'WORKFLOW_RUN_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_run.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF _run.status NOT IN ('pending','running') THEN
    RAISE EXCEPTION 'WORKFLOW_RUN_INVALID_TRANSITION' USING ERRCODE='22023';
  END IF;

  UPDATE public.workflow_runs SET status = 'canceled', ended_at = now()
  WHERE id = _run_id RETURNING * INTO _run;

  PERFORM public._emit_outbox_event(_run.tenant_id, 'workflow.run.canceled', 'workflow_run', _run.id::text,
    jsonb_build_object('run_id', _run.id, 'reason', _reason, 'actor_id', _actor),
    _idempotency_key, _correlation_id);
  RETURN _run;
END $$;

-- =====================================================================
-- GRANTS — restrict EXECUTE to authenticated + service_role
-- =====================================================================
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'create_task(uuid,text,text,task_priority,timestamptz,uuid,text,text)',
    'update_task(uuid,text,text,task_priority,timestamptz,bigint,text,text)',
    'transition_task(uuid,task_status,bigint,text,text)',
    'assign_task(uuid,uuid,text,text,text)',
    'comment_task(uuid,text,text,text)',
    'create_document(uuid,text,text,text[],jsonb,text,bigint,text,text)',
    'update_document(uuid,text,text,text[],bigint,text,text)',
    'upload_document_version(uuid,jsonb,text,bigint,text,text,text)',
    'share_document(uuid,text,uuid,text,text,text)',
    'archive_document(uuid,bigint,text,text)',
    'schedule_meeting(uuid,text,text,timestamptz,timestamptz,text,text,text,uuid[],text,text)',
    'update_meeting(uuid,text,text,timestamptz,timestamptz,text,text,bigint,text,text)',
    'cancel_meeting(uuid,text,bigint,text,text)',
    'set_meeting_rsvp(uuid,meeting_rsvp,text,text)',
    'create_workflow(uuid,text,text,jsonb,text,text)',
    'publish_workflow(uuid,bigint,text,text)',
    'start_workflow_run(uuid,jsonb,text,text)',
    'advance_workflow_step(uuid,text,workflow_step_status,jsonb,jsonb,text,text,text)',
    'cancel_workflow_run(uuid,text,text,text)'
  ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', fn);
  END LOOP;
END $$;
