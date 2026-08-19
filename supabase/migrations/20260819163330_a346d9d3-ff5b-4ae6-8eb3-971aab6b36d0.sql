-- ============ 1. Task columns ============
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'HUMAN',
  ADD COLUMN IF NOT EXISTS human_owner_id uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS ai_worker_id uuid,
  ADD COLUMN IF NOT EXISTS expected_deliverable text,
  ADD COLUMN IF NOT EXISTS acceptance_criteria text,
  ADD COLUMN IF NOT EXISTS ai_execution_status text NOT NULL DEFAULT 'NOT_STARTED';

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_execution_mode_chk;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_execution_mode_chk
  CHECK (execution_mode IN ('HUMAN','AI_ASSISTED'));
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_ai_execution_status_chk;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_ai_execution_status_chk
  CHECK (ai_execution_status IN ('NOT_STARTED','QUEUED','RUNNING','WAITING_REVIEW','CHANGES_REQUESTED','ACCEPTED','FAILED'));

-- ============ 2. AI workers ============
CREATE TABLE IF NOT EXISTS public.ai_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  role text NOT NULL,
  skills text[] NOT NULL DEFAULT '{}',
  allowed_tools text[] NOT NULL DEFAULT '{}',
  permission_scope text NOT NULL DEFAULT 'ACTOR_DELEGATED',
  provider_config_ref text NOT NULL DEFAULT 'lovable-ai-gateway',
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

GRANT SELECT ON public.ai_workers TO authenticated;
GRANT ALL ON public.ai_workers TO service_role;
ALTER TABLE public.ai_workers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_workers_select ON public.ai_workers;
CREATE POLICY ai_workers_select ON public.ai_workers FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

-- ============ 3. AI task executions ============
CREATE TABLE IF NOT EXISTS public.ai_task_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  ai_worker_id uuid NOT NULL REFERENCES public.ai_workers(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'QUEUED',
  revision integer NOT NULL DEFAULT 1,
  template_code text,
  deliverable_type text,
  deliverable_title text,
  deliverable_content text,
  source_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_request text,
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  reviewed_by uuid REFERENCES public.users(id),
  reviewed_at timestamptz,
  created_by uuid REFERENCES public.users(id),
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, revision),
  CHECK (status IN ('QUEUED','RUNNING','WAITING_REVIEW','CHANGES_REQUESTED','ACCEPTED','FAILED'))
);
CREATE INDEX IF NOT EXISTS ai_task_executions_task_idx ON public.ai_task_executions(task_id, revision DESC);

GRANT SELECT ON public.ai_task_executions TO authenticated;
GRANT ALL ON public.ai_task_executions TO service_role;
ALTER TABLE public.ai_task_executions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_task_executions_select ON public.ai_task_executions;
-- Chỉ đọc; mọi ghi đi qua RPC SECURITY DEFINER (không có policy insert/update/delete).
CREATE POLICY ai_task_executions_select ON public.ai_task_executions FOR SELECT TO authenticated
  USING (
    public.is_tenant_member(tenant_id)
    AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.deleted_at IS NULL)
  );

DROP TRIGGER IF EXISTS audit_ai_task_executions ON public.ai_task_executions;
CREATE TRIGGER audit_ai_task_executions
  AFTER INSERT OR UPDATE OR DELETE ON public.ai_task_executions
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('ai_task_execution');

-- ============ 4. Seed default AI workers per tenant ============
CREATE OR REPLACE FUNCTION public.ensure_default_ai_workers(_tenant_id uuid)
RETURNS SETOF public.ai_workers
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT public.is_tenant_member(_tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

  INSERT INTO public.ai_workers (tenant_id, code, name, role, skills, allowed_tools, permission_scope)
  VALUES
    (_tenant_id, 'PROJECT_ANALYST', 'AI Project Analyst', 'Phân tích dự án',
      ARRAY['SUMMARIZE_WORK','RISK_ANALYSIS','PROGRESS_REPORT'], ARRAY['AI_CONTEXT_ENGINE'], 'ACTOR_DELEGATED'),
    (_tenant_id, 'MEETING_ASSISTANT', 'AI Meeting Assistant', 'Trợ lý cuộc họp',
      ARRAY['MEETING_RECALL','SUMMARIZE_WORK','DRAFT_FOLLOW_UP'], ARRAY['AI_CONTEXT_ENGINE'], 'ACTOR_DELEGATED'),
    (_tenant_id, 'RESEARCH_ASSISTANT', 'AI Research Assistant', 'Nghiên cứu & tổng hợp',
      ARRAY['SUMMARIZE_WORK','KNOWLEDGE_LOOKUP','RISK_ANALYSIS'], ARRAY['AI_CONTEXT_ENGINE'], 'ACTOR_DELEGATED')
  ON CONFLICT (tenant_id, code) DO NOTHING;

  RETURN QUERY SELECT * FROM public.ai_workers w
    WHERE w.tenant_id = _tenant_id AND w.status = 'ACTIVE' ORDER BY w.code;
END $$;
GRANT EXECUTE ON FUNCTION public.ensure_default_ai_workers(uuid) TO authenticated;

-- ============ 5. Assign task to AI ============
CREATE OR REPLACE FUNCTION public.assign_task_to_ai(
  _task_id uuid, _ai_worker_id uuid, _expected_deliverable text,
  _acceptance_criteria text, _idempotency_key text DEFAULT NULL, _correlation_id text DEFAULT NULL)
RETURNS public.tasks
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _actor uuid := auth.uid(); _task public.tasks; _w public.ai_workers;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _task FROM public.tasks WHERE id=_task_id AND deleted_at IS NULL;
  IF _task.id IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_task.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=_task.workspace_id AND m.user_id=_actor) THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO _w FROM public.ai_workers WHERE id=_ai_worker_id;
  IF _w.id IS NULL OR _w.tenant_id <> _task.tenant_id OR _w.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'AI_WORKER_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF coalesce(btrim(_expected_deliverable),'') = '' OR coalesce(btrim(_acceptance_criteria),'') = '' THEN
    RAISE EXCEPTION 'AI_TASK_SPEC_REQUIRED' USING ERRCODE='22023';
  END IF;

  UPDATE public.tasks SET
    execution_mode = 'AI_ASSISTED',
    ai_worker_id = _w.id,
    human_owner_id = COALESCE(human_owner_id, created_by, _actor),
    expected_deliverable = _expected_deliverable,
    acceptance_criteria = _acceptance_criteria,
    ai_execution_status = CASE WHEN ai_execution_status = 'ACCEPTED' THEN ai_execution_status ELSE 'NOT_STARTED' END,
    updated_by = _actor
  WHERE id = _task_id RETURNING * INTO _task;

  PERFORM public._emit_outbox_event(_task.tenant_id, 'task.ai.assigned', 'task', _task.id::text,
    jsonb_build_object('task_id',_task.id,'ai_worker_id',_w.id,'actor_id',_actor),
    _idempotency_key, _correlation_id);
  RETURN _task;
END $$;
GRANT EXECUTE ON FUNCTION public.assign_task_to_ai(uuid,uuid,text,text,text,text) TO authenticated;

-- ============ 6. Start execution ============
CREATE OR REPLACE FUNCTION public.start_ai_task_execution(
  _task_id uuid, _template_code text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL, _correlation_id text DEFAULT NULL)
RETURNS public.ai_task_executions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _actor uuid := auth.uid(); _task public.tasks; _exec public.ai_task_executions; _rev int; _prev public.ai_task_executions;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _task FROM public.tasks WHERE id=_task_id AND deleted_at IS NULL;
  IF _task.id IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_task.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=_task.workspace_id AND m.user_id=_actor) THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  IF _task.ai_worker_id IS NULL THEN RAISE EXCEPTION 'AI_WORKER_NOT_ASSIGNED' USING ERRCODE='22023'; END IF;

  SELECT * INTO _prev FROM public.ai_task_executions
    WHERE task_id=_task_id AND status IN ('QUEUED','RUNNING') ORDER BY revision DESC LIMIT 1;
  IF _prev.id IS NOT NULL THEN RETURN _prev; END IF;

  SELECT COALESCE(MAX(revision),0)+1 INTO _rev FROM public.ai_task_executions WHERE task_id=_task_id;

  INSERT INTO public.ai_task_executions(
    tenant_id, workspace_id, task_id, ai_worker_id, status, revision, template_code,
    change_request, started_at, created_by)
  VALUES (_task.tenant_id, _task.workspace_id, _task_id, _task.ai_worker_id, 'RUNNING', _rev, _template_code,
    (SELECT change_request FROM public.ai_task_executions p WHERE p.task_id=_task_id AND p.status='CHANGES_REQUESTED' ORDER BY p.revision DESC LIMIT 1),
    now(), _actor)
  RETURNING * INTO _exec;

  UPDATE public.tasks SET ai_execution_status='RUNNING', updated_by=_actor WHERE id=_task_id;

  PERFORM public._emit_outbox_event(_task.tenant_id, 'task.ai.execution_started', 'ai_task_execution', _exec.id::text,
    jsonb_build_object('task_id',_task_id,'execution_id',_exec.id,'revision',_rev,'actor_id',_actor),
    _idempotency_key, _correlation_id);
  RETURN _exec;
END $$;
GRANT EXECUTE ON FUNCTION public.start_ai_task_execution(uuid,text,text,text) TO authenticated;

-- ============ 7. Finish execution (AI result -> WAITING_REVIEW / FAILED) ============
CREATE OR REPLACE FUNCTION public.finish_ai_task_execution(
  _execution_id uuid, _status text, _deliverable_type text DEFAULT NULL,
  _deliverable_title text DEFAULT NULL, _deliverable_content text DEFAULT NULL,
  _source_refs jsonb DEFAULT '[]'::jsonb, _evidence jsonb DEFAULT '{}'::jsonb,
  _error_code text DEFAULT NULL, _correlation_id text DEFAULT NULL)
RETURNS public.ai_task_executions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _actor uuid := auth.uid(); _exec public.ai_task_executions;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF _status NOT IN ('WAITING_REVIEW','FAILED') THEN RAISE EXCEPTION 'AI_EXECUTION_STATUS_NOT_ALLOWED' USING ERRCODE='22023'; END IF;
  SELECT * INTO _exec FROM public.ai_task_executions WHERE id=_execution_id;
  IF _exec.id IS NULL THEN RAISE EXCEPTION 'AI_EXECUTION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_exec.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=_exec.workspace_id AND m.user_id=_actor) THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  IF _exec.status NOT IN ('QUEUED','RUNNING') THEN RAISE EXCEPTION 'AI_EXECUTION_ALREADY_FINISHED' USING ERRCODE='22023'; END IF;

  UPDATE public.ai_task_executions SET
    status=_status, deliverable_type=_deliverable_type, deliverable_title=_deliverable_title,
    deliverable_content=_deliverable_content, source_refs=COALESCE(_source_refs,'[]'::jsonb),
    evidence=COALESCE(_evidence,'{}'::jsonb), error_code=_error_code,
    completed_at=now(), row_version=row_version+1, updated_at=now()
  WHERE id=_execution_id RETURNING * INTO _exec;

  UPDATE public.tasks SET ai_execution_status=_status WHERE id=_exec.task_id;

  PERFORM public._emit_outbox_event(_exec.tenant_id, 'task.ai.execution_finished', 'ai_task_execution', _exec.id::text,
    jsonb_build_object('task_id',_exec.task_id,'execution_id',_exec.id,'status',_status,'revision',_exec.revision),
    _execution_id::text || ':' || _status, _correlation_id);
  RETURN _exec;
END $$;
GRANT EXECUTE ON FUNCTION public.finish_ai_task_execution(uuid,text,text,text,text,jsonb,jsonb,text,text) TO authenticated;

-- ============ 8. Request changes (new revision) ============
CREATE OR REPLACE FUNCTION public.request_ai_execution_changes(
  _execution_id uuid, _feedback text, _correlation_id text DEFAULT NULL)
RETURNS public.ai_task_executions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _actor uuid := auth.uid(); _exec public.ai_task_executions;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF coalesce(btrim(_feedback),'') = '' THEN RAISE EXCEPTION 'AI_FEEDBACK_REQUIRED' USING ERRCODE='22023'; END IF;
  SELECT * INTO _exec FROM public.ai_task_executions WHERE id=_execution_id;
  IF _exec.id IS NULL THEN RAISE EXCEPTION 'AI_EXECUTION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_exec.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=_exec.workspace_id AND m.user_id=_actor) THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  IF _exec.status <> 'WAITING_REVIEW' THEN RAISE EXCEPTION 'AI_EXECUTION_NOT_REVIEWABLE' USING ERRCODE='22023'; END IF;

  UPDATE public.ai_task_executions SET
    status='CHANGES_REQUESTED', change_request=_feedback, reviewed_by=_actor, reviewed_at=now(),
    row_version=row_version+1, updated_at=now()
  WHERE id=_execution_id RETURNING * INTO _exec;

  UPDATE public.tasks SET ai_execution_status='CHANGES_REQUESTED' WHERE id=_exec.task_id;

  PERFORM public._emit_outbox_event(_exec.tenant_id, 'task.ai.changes_requested', 'ai_task_execution', _exec.id::text,
    jsonb_build_object('task_id',_exec.task_id,'execution_id',_exec.id,'reviewer_id',_actor),
    _execution_id::text || ':changes', _correlation_id);
  RETURN _exec;
END $$;
GRANT EXECUTE ON FUNCTION public.request_ai_execution_changes(uuid,text,text) TO authenticated;

-- ============ 9. Accept (human only) + trusted task completion ============
CREATE OR REPLACE FUNCTION public.accept_ai_task_execution(
  _execution_id uuid, _complete_task boolean DEFAULT true,
  _idempotency_key text DEFAULT NULL, _correlation_id text DEFAULT NULL)
RETURNS public.ai_task_executions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _actor uuid := auth.uid(); _exec public.ai_task_executions; _task public.tasks; _allowed boolean;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _exec FROM public.ai_task_executions WHERE id=_execution_id;
  IF _exec.id IS NULL THEN RAISE EXCEPTION 'AI_EXECUTION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_exec.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _task FROM public.tasks WHERE id=_exec.task_id AND deleted_at IS NULL;
  IF _task.id IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF _exec.status = 'ACCEPTED' THEN RETURN _exec; END IF;
  IF _exec.status <> 'WAITING_REVIEW' THEN RAISE EXCEPTION 'AI_EXECUTION_NOT_REVIEWABLE' USING ERRCODE='22023'; END IF;

  -- Chỉ con người có trách nhiệm mới được nghiệm thu.
  _allowed := (_task.human_owner_id = _actor) OR (_task.created_by = _actor)
    OR EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=_task.workspace_id
               AND m.user_id=_actor AND m.role IN ('owner','admin'));
  IF NOT _allowed THEN RAISE EXCEPTION 'AI_REVIEW_FORBIDDEN' USING ERRCODE='42501'; END IF;

  UPDATE public.ai_task_executions SET status='ACCEPTED', reviewed_by=_actor, reviewed_at=now(),
    row_version=row_version+1, updated_at=now()
  WHERE id=_execution_id RETURNING * INTO _exec;

  UPDATE public.tasks SET ai_execution_status='ACCEPTED', updated_by=_actor WHERE id=_task.id;

  IF _complete_task AND _task.status <> 'done' THEN
    PERFORM public.transition_task(_task.id, 'done'::task_status, NULL,
      COALESCE(_idempotency_key, _execution_id::text || ':accept'), _correlation_id);
  END IF;

  PERFORM public._emit_outbox_event(_exec.tenant_id, 'task.ai.execution_accepted', 'ai_task_execution', _exec.id::text,
    jsonb_build_object('task_id',_task.id,'execution_id',_exec.id,'reviewer_id',_actor),
    COALESCE(_idempotency_key, _execution_id::text || ':accepted'), _correlation_id);
  RETURN _exec;
END $$;
GRANT EXECUTE ON FUNCTION public.accept_ai_task_execution(uuid,boolean,text,text) TO authenticated;