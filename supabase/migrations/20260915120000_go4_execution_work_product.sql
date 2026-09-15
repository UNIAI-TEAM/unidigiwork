-- GO-4 — Unified work execution + Work Product provenance.
-- Additive. Does not alter GO-3 Option B semantics, Office save, or WEE pipeline.
-- Canonical execution authority remains public.ai_task_executions (table name unchanged).
-- work_units catalog binding is NOT Execution → Work Product.

-- ---------------------------------------------------------------------------
-- A. Generalize ai_task_executions (AI | HUMAN). No HYBRID row type.
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_task_executions
  ADD COLUMN IF NOT EXISTS executor_type text,
  ADD COLUMN IF NOT EXISTS executor_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS step_write_failure_count integer NOT NULL DEFAULT 0;

UPDATE public.ai_task_executions
   SET executor_type = 'AI'
 WHERE executor_type IS NULL;

ALTER TABLE public.ai_task_executions
  ALTER COLUMN executor_type SET DEFAULT 'AI',
  ALTER COLUMN executor_type SET NOT NULL;

ALTER TABLE public.ai_task_executions
  ALTER COLUMN ai_worker_id DROP NOT NULL;

ALTER TABLE public.ai_task_executions
  DROP CONSTRAINT IF EXISTS ai_task_executions_executor_chk;

ALTER TABLE public.ai_task_executions
  ADD CONSTRAINT ai_task_executions_executor_chk CHECK (
    executor_type IN ('AI', 'HUMAN')
    AND (
      (executor_type = 'AI' AND ai_worker_id IS NOT NULL)
      OR (executor_type = 'HUMAN' AND executor_user_id IS NOT NULL AND ai_worker_id IS NULL)
    )
  );

CREATE INDEX IF NOT EXISTS ai_task_executions_tenant_task_idx
  ON public.ai_task_executions (tenant_id, task_id, revision DESC);

CREATE INDEX IF NOT EXISTS ai_task_executions_executor_type_idx
  ON public.ai_task_executions (tenant_id, executor_type);

-- ---------------------------------------------------------------------------
-- B. Junction: Execution ↔ Work Product (N:M). Relation authority only.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.execution_work_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  execution_id uuid NOT NULL REFERENCES public.ai_task_executions(id) ON DELETE CASCADE,
  work_product_id uuid NOT NULL REFERENCES public.work_products(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'CREATED'
    CHECK (role IN ('CREATED', 'CONTRIBUTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (execution_id, work_product_id)
);

CREATE INDEX IF NOT EXISTS execution_work_products_tenant_exec_idx
  ON public.execution_work_products (tenant_id, execution_id);
CREATE INDEX IF NOT EXISTS execution_work_products_tenant_wp_idx
  ON public.execution_work_products (tenant_id, work_product_id);

GRANT SELECT, INSERT ON public.execution_work_products TO authenticated;
GRANT ALL ON public.execution_work_products TO service_role;
ALTER TABLE public.execution_work_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS execution_work_products_select ON public.execution_work_products;
CREATE POLICY execution_work_products_select ON public.execution_work_products
  FOR SELECT TO authenticated
  USING (
    public.is_tenant_member(tenant_id)
    AND EXISTS (
      SELECT 1 FROM public.ai_task_executions e
       WHERE e.id = execution_id AND e.tenant_id = execution_work_products.tenant_id
    )
    AND EXISTS (
      SELECT 1 FROM public.work_products wp
       WHERE wp.id = work_product_id AND wp.tenant_id = execution_work_products.tenant_id
         AND wp.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS execution_work_products_insert ON public.execution_work_products;
CREATE POLICY execution_work_products_insert ON public.execution_work_products
  FOR INSERT TO authenticated
  WITH CHECK (false);

COMMENT ON TABLE public.execution_work_products IS
  'GO-4 provenance junction. Not a Work Product authority. Writes via link_execution_work_product only.';

CREATE OR REPLACE FUNCTION public._go4_ewp_tenant_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE et uuid; wt uuid;
BEGIN
  SELECT tenant_id INTO et FROM public.ai_task_executions WHERE id = NEW.execution_id;
  SELECT tenant_id INTO wt FROM public.work_products WHERE id = NEW.work_product_id;
  IF et IS NULL OR wt IS NULL OR NEW.tenant_id IS DISTINCT FROM et OR et IS DISTINCT FROM wt THEN
    RAISE EXCEPTION 'CROSS_TENANT' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS execution_work_products_tenant_guard ON public.execution_work_products;
CREATE TRIGGER execution_work_products_tenant_guard
  BEFORE INSERT ON public.execution_work_products
  FOR EACH ROW EXECUTE FUNCTION public._go4_ewp_tenant_guard();

-- ---------------------------------------------------------------------------
-- C. Graph node type EXECUTION + edges (projection only)
-- ---------------------------------------------------------------------------
DO $go4_entity_check$
DECLARE def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE n.nspname = 'public' AND t.relname = 'work_nodes'
     AND c.conname = 'work_nodes_entity_type_check';
  IF def IS NOT NULL AND def LIKE '%EXECUTION%' THEN
    RAISE NOTICE 'work_nodes entity_type already allows EXECUTION';
  ELSE
    ALTER TABLE public.work_nodes DROP CONSTRAINT IF EXISTS work_nodes_entity_type_check;
    ALTER TABLE public.work_nodes ADD CONSTRAINT work_nodes_entity_type_check
      CHECK (entity_type IN (
        'TENANT','WORKSPACE','TASK','PERSON','MEETING','CHAT_CHANNEL',
        'DOCUMENT','EMAIL','MEETING_ARTIFACT','WORK_PRODUCT','EXECUTION'
      ));
  END IF;
END
$go4_entity_check$;

INSERT INTO public.work_relationship_types (code, source_type, target_type, user_creatable, system_creatable)
VALUES
  ('HAS_EXECUTION', 'TASK', 'EXECUTION', false, true),
  ('PRODUCES', 'EXECUTION', 'WORK_PRODUCT', false, true),
  ('BELONGS_TO', 'EXECUTION', 'WORKSPACE', false, true),
  ('PERFORMS', 'PERSON', 'EXECUTION', false, true)
ON CONFLICT (code, source_type, target_type) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_view_work_entity(_entity_type text, _entity_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE ok boolean := false;
BEGIN
  CASE _entity_type
    WHEN 'WORKSPACE' THEN SELECT EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id = _entity_id) INTO ok;
    WHEN 'TASK' THEN SELECT EXISTS(SELECT 1 FROM public.tasks t WHERE t.id = _entity_id AND t.deleted_at IS NULL) INTO ok;
    WHEN 'MEETING' THEN SELECT EXISTS(SELECT 1 FROM public.meetings m WHERE m.id = _entity_id) INTO ok;
    WHEN 'MEETING_ARTIFACT' THEN SELECT EXISTS(SELECT 1 FROM public.meeting_artifacts a WHERE a.id = _entity_id) INTO ok;
    WHEN 'DOCUMENT' THEN SELECT EXISTS(SELECT 1 FROM public.documents d WHERE d.id = _entity_id AND d.deleted_at IS NULL) INTO ok;
    WHEN 'EMAIL' THEN SELECT EXISTS(SELECT 1 FROM public.email_threads e WHERE e.id = _entity_id AND e.deleted_at IS NULL) INTO ok;
    WHEN 'CHAT_CHANNEL' THEN SELECT EXISTS(SELECT 1 FROM public.chat_channels c WHERE c.id = _entity_id AND c.deleted_at IS NULL) INTO ok;
    WHEN 'PERSON' THEN SELECT EXISTS(
        SELECT 1 FROM public.tenant_members tm
        WHERE tm.user_id = _entity_id AND public.is_tenant_member(tm.tenant_id)) INTO ok;
    WHEN 'TENANT' THEN SELECT public.is_tenant_member(_entity_id) INTO ok;
    WHEN 'WORK_PRODUCT' THEN ok := public._go3_can_view_work_product(_entity_id);
    WHEN 'EXECUTION' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.ai_task_executions e
         JOIN public.tasks t ON t.id = e.task_id AND t.deleted_at IS NULL
        WHERE e.id = _entity_id AND public.is_tenant_member(e.tenant_id)
      ) INTO ok;
    ELSE ok := false;
  END CASE;
  RETURN COALESCE(ok, false);
END $$;

CREATE OR REPLACE FUNCTION public._work_entity_scope(_entity_type text, _entity_id uuid)
RETURNS TABLE (tenant_id uuid, workspace_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  CASE _entity_type
    WHEN 'WORKSPACE' THEN RETURN QUERY SELECT w.tenant_id, w.id FROM public.workspaces w WHERE w.id = _entity_id;
    WHEN 'TASK' THEN RETURN QUERY SELECT t.tenant_id, t.workspace_id FROM public.tasks t WHERE t.id = _entity_id;
    WHEN 'MEETING' THEN RETURN QUERY SELECT m.tenant_id, m.workspace_id FROM public.meetings m WHERE m.id = _entity_id;
    WHEN 'MEETING_ARTIFACT' THEN RETURN QUERY SELECT a.tenant_id, a.workspace_id FROM public.meeting_artifacts a WHERE a.id = _entity_id;
    WHEN 'DOCUMENT' THEN RETURN QUERY SELECT d.tenant_id, d.workspace_id FROM public.documents d WHERE d.id = _entity_id;
    WHEN 'EMAIL' THEN RETURN QUERY SELECT e.tenant_id, e.workspace_id FROM public.email_threads e WHERE e.id = _entity_id;
    WHEN 'CHAT_CHANNEL' THEN RETURN QUERY SELECT c.tenant_id, c.workspace_id FROM public.chat_channels c WHERE c.id = _entity_id;
    WHEN 'TENANT' THEN RETURN QUERY SELECT _entity_id, NULL::uuid;
    WHEN 'WORK_PRODUCT' THEN RETURN QUERY SELECT s.tenant_id, s.workspace_id FROM public._go3_work_product_scope(_entity_id) s;
    WHEN 'EXECUTION' THEN RETURN QUERY SELECT e.tenant_id, e.workspace_id FROM public.ai_task_executions e WHERE e.id = _entity_id;
    ELSE RETURN;
  END CASE;
END $$;
REVOKE EXECUTE ON FUNCTION public._work_entity_scope(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._work_entity_scope(text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._touch_execution_graph_node(_execution_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.ai_task_executions%ROWTYPE;
  nid uuid;
BEGIN
  SELECT * INTO e FROM public.ai_task_executions WHERE id = _execution_id;
  IF e.id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.work_nodes (tenant_id, entity_type, entity_id, metadata)
  VALUES (e.tenant_id, 'EXECUTION', e.id, jsonb_build_object(
    'status', e.status,
    'executorType', e.executor_type,
    'revision', e.revision,
    'taskId', e.task_id
  ))
  ON CONFLICT (tenant_id, entity_type, entity_id) DO NOTHING;

  SELECT id INTO nid FROM public.work_nodes
   WHERE tenant_id = e.tenant_id AND entity_type = 'EXECUTION' AND entity_id = e.id;
  IF nid IS NULL THEN RETURN NULL; END IF;

  UPDATE public.work_nodes
     SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'status', e.status,
           'executorType', e.executor_type,
           'revision', e.revision,
           'taskId', e.task_id
         ),
         updated_at = now()
   WHERE id = nid;

  PERFORM public._work_graph_link_system_in_tenant(
    e.tenant_id, 'TASK', e.task_id, 'EXECUTION', e.id, 'HAS_EXECUTION');
  IF e.workspace_id IS NOT NULL THEN
    PERFORM public._work_graph_link_system_in_tenant(
      e.tenant_id, 'EXECUTION', e.id, 'WORKSPACE', e.workspace_id, 'BELONGS_TO');
  END IF;
  IF e.executor_user_id IS NOT NULL THEN
    PERFORM public._work_graph_link_system_in_tenant(
      e.tenant_id, 'PERSON', e.executor_user_id, 'EXECUTION', e.id, 'PERFORMS');
  END IF;
  RETURN nid;
END $$;
REVOKE ALL ON FUNCTION public._touch_execution_graph_node(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._touch_execution_graph_node(uuid) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public._go4_project_execution_produces(_execution_id uuid, _work_product_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.ai_task_executions%ROWTYPE;
BEGIN
  SELECT * INTO e FROM public.ai_task_executions WHERE id = _execution_id;
  IF e.id IS NULL THEN RETURN; END IF;
  PERFORM public._touch_execution_graph_node(e.id);
  PERFORM public._touch_work_product_graph_node(_work_product_id, NULL);
  PERFORM public._work_graph_link_system_in_tenant(
    e.tenant_id, 'EXECUTION', e.id, 'WORK_PRODUCT', _work_product_id, 'PRODUCES');
  -- Derived GO-3 shortcut from deterministic execution.task_id + junction (not title inference).
  PERFORM public._work_graph_link_system_in_tenant(
    e.tenant_id, 'TASK', e.task_id, 'WORK_PRODUCT', _work_product_id, 'PRODUCES');
END $$;
REVOKE ALL ON FUNCTION public._go4_project_execution_produces(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._go4_project_execution_produces(uuid, uuid) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.project_execution_created(_tenant_id uuid, _payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE exec_id uuid; e public.ai_task_executions%ROWTYPE; nid uuid;
BEGIN
  exec_id := COALESCE(
    NULLIF(_payload->>'execution_id','')::uuid,
    NULLIF(_payload->>'executionId','')::uuid,
    NULLIF(_payload->>'id','')::uuid
  );
  IF exec_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_PAYLOAD');
  END IF;
  SELECT * INTO e FROM public.ai_task_executions WHERE id = exec_id;
  IF e.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;
  IF _tenant_id IS NOT NULL AND e.tenant_id IS DISTINCT FROM _tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CROSS_TENANT');
  END IF;
  nid := public._touch_execution_graph_node(e.id);
  IF nid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DELETED_OR_MISSING');
  END IF;
  RETURN jsonb_build_object('ok', true, 'executionId', e.id, 'nodeId', nid);
END $$;
REVOKE ALL ON FUNCTION public.project_execution_created(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_execution_created(uuid, jsonb) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.project_execution_work_product_linked(_tenant_id uuid, _payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE exec_id uuid; wp_id uuid; e public.ai_task_executions%ROWTYPE;
BEGIN
  exec_id := COALESCE(NULLIF(_payload->>'execution_id','')::uuid, NULLIF(_payload->>'executionId','')::uuid);
  wp_id := COALESCE(NULLIF(_payload->>'work_product_id','')::uuid, NULLIF(_payload->>'workProductId','')::uuid);
  IF exec_id IS NULL OR wp_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_PAYLOAD');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.execution_work_products
     WHERE execution_id = exec_id AND work_product_id = wp_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;
  SELECT * INTO e FROM public.ai_task_executions WHERE id = exec_id;
  IF e.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;
  IF _tenant_id IS NOT NULL AND e.tenant_id IS DISTINCT FROM _tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CROSS_TENANT');
  END IF;
  PERFORM public._go4_project_execution_produces(exec_id, wp_id);
  RETURN jsonb_build_object('ok', true, 'executionId', exec_id, 'workProductId', wp_id);
END $$;
REVOKE ALL ON FUNCTION public.project_execution_work_product_linked(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_execution_work_product_linked(uuid, jsonb) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.tg_go4_execution_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public._touch_execution_graph_node(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS go4_execution_graph ON public.ai_task_executions;
CREATE TRIGGER go4_execution_graph
  AFTER INSERT OR UPDATE OF status, executor_type, executor_user_id ON public.ai_task_executions
  FOR EACH ROW EXECUTE FUNCTION public.tg_go4_execution_write();

CREATE OR REPLACE FUNCTION public.tg_go4_ewp_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public._go4_project_execution_produces(NEW.execution_id, NEW.work_product_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  BEGIN
    PERFORM public._emit_outbox_event(
      NEW.tenant_id,
      'execution.work_product.linked',
      'execution_work_product',
      NEW.id::text,
      jsonb_build_object(
        'execution_id', NEW.execution_id,
        'work_product_id', NEW.work_product_id,
        'role', NEW.role
      ),
      'execution.work_product.linked:' || NEW.execution_id::text || ':' || NEW.work_product_id::text,
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS go4_ewp_graph ON public.execution_work_products;
CREATE TRIGGER go4_ewp_graph
  AFTER INSERT ON public.execution_work_products
  FOR EACH ROW EXECUTE FUNCTION public.tg_go4_ewp_write();

-- ---------------------------------------------------------------------------
-- D. HUMAN execution (provenance only — not AI WEE orchestration)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_human_task_execution(
  _task_id uuid,
  _idempotency_key text DEFAULT NULL,
  _correlation_id text DEFAULT NULL)
RETURNS public.ai_task_executions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _actor uuid := auth.uid();
  _task public.tasks;
  _exec public.ai_task_executions;
  _rev int;
  _prev public.ai_task_executions;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _task FROM public.tasks WHERE id=_task_id AND deleted_at IS NULL;
  IF _task.id IS NULL THEN RAISE EXCEPTION 'TASK_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_task.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=_task.workspace_id AND m.user_id=_actor) THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  SELECT * INTO _prev FROM public.ai_task_executions
    WHERE task_id=_task_id AND executor_type='HUMAN' AND status IN ('QUEUED','RUNNING','WAITING_REVIEW')
    ORDER BY revision DESC LIMIT 1;
  IF _prev.id IS NOT NULL THEN RETURN _prev; END IF;

  SELECT COALESCE(MAX(revision),0)+1 INTO _rev FROM public.ai_task_executions WHERE task_id=_task_id;

  INSERT INTO public.ai_task_executions(
    tenant_id, workspace_id, task_id, ai_worker_id, executor_type, executor_user_id,
    status, revision, started_at, completed_at, created_by)
  VALUES (
    _task.tenant_id, _task.workspace_id, _task_id, NULL, 'HUMAN', _actor,
    'WAITING_REVIEW', _rev, now(), now(), _actor)
  RETURNING * INTO _exec;

  PERFORM public._emit_outbox_event(
    _task.tenant_id, 'execution.execution.created', 'ai_task_execution', _exec.id::text,
    jsonb_build_object(
      'task_id', _task_id, 'execution_id', _exec.id, 'revision', _rev,
      'executor_type', 'HUMAN', 'actor_id', _actor),
    COALESCE(_idempotency_key, 'execution.created:' || _exec.id::text), _correlation_id);
  RETURN _exec;
END $$;
GRANT EXECUTE ON FUNCTION public.start_human_task_execution(uuid,text,text) TO authenticated;

-- ---------------------------------------------------------------------------
-- E. Trusted link RPC (idempotent, fail-closed cross-tenant)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_execution_work_product(
  _execution_id uuid,
  _work_product_id uuid,
  _idempotency_key text DEFAULT NULL,
  _correlation_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _actor uuid := auth.uid();
  _exec public.ai_task_executions;
  _wp public.work_products;
  _role text;
  _row public.execution_work_products;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _exec FROM public.ai_task_executions WHERE id = _execution_id;
  IF _exec.id IS NULL THEN RAISE EXCEPTION 'AI_EXECUTION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_exec.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members m
     WHERE m.workspace_id = _exec.workspace_id AND m.user_id = _actor
  ) THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  SELECT * INTO _wp FROM public.work_products WHERE id = _work_product_id;
  IF _wp.id IS NULL OR _wp.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'WORK_PRODUCT_NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF NOT public.is_tenant_member(_wp.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF _exec.tenant_id IS DISTINCT FROM _wp.tenant_id THEN
    RAISE EXCEPTION 'CROSS_TENANT' USING ERRCODE='42501';
  END IF;

  SELECT * INTO _row FROM public.execution_work_products
   WHERE execution_id = _execution_id AND work_product_id = _work_product_id;
  IF _row.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'linked', true, 'idempotent', true, 'id', _row.id,
      'executionId', _row.execution_id, 'workProductId', _row.work_product_id, 'role', _row.role);
  END IF;

  IF EXISTS (SELECT 1 FROM public.execution_work_products WHERE work_product_id = _work_product_id) THEN
    _role := 'CONTRIBUTED';
  ELSE
    _role := 'CREATED';
  END IF;

  INSERT INTO public.execution_work_products (
    tenant_id, execution_id, work_product_id, role, created_by)
  VALUES (_exec.tenant_id, _execution_id, _work_product_id, _role, _actor)
  RETURNING * INTO _row;

  RETURN jsonb_build_object(
    'linked', true, 'idempotent', false, 'id', _row.id,
    'executionId', _row.execution_id, 'workProductId', _row.work_product_id, 'role', _row.role);
END $$;
GRANT EXECUTE ON FUNCTION public.link_execution_work_product(uuid,uuid,text,text) TO authenticated;

-- ---------------------------------------------------------------------------
-- F. Durable step-write failure evidence (replaces in-memory Map as authority)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_execution_step_write_failure(
  _execution_id uuid, _kind text, _reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e public.ai_task_executions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501'; END IF;
  SELECT * INTO e FROM public.ai_task_executions WHERE id = _execution_id;
  IF e.id IS NULL THEN RAISE EXCEPTION 'AI_EXECUTION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.is_tenant_member(e.tenant_id) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;

  UPDATE public.ai_task_executions
     SET step_write_failure_count = step_write_failure_count + 1,
         evidence = COALESCE(evidence, '{}'::jsonb) || jsonb_build_object(
           'lastStepWriteFailure', jsonb_build_object(
             'kind', COALESCE(_kind, ''),
             'reason', COALESCE(_reason, ''),
             'at', now()
           )
         ),
         updated_at = now()
   WHERE id = _execution_id
   RETURNING * INTO e;

  RETURN jsonb_build_object(
    'executionId', e.id,
    'stepWriteFailureCount', e.step_write_failure_count
  );
END $$;
GRANT EXECUTE ON FUNCTION public.record_execution_step_write_failure(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_work_execution_steps(_execution_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e public.ai_task_executions%ROWTYPE; v_steps integer; v_expected integer := 6; v_complete text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501'; END IF;
  SELECT * INTO e FROM public.ai_task_executions WHERE id = _execution_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'EXECUTION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.is_tenant_member(e.tenant_id) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;

  SELECT count(*) INTO v_steps FROM public.work_execution_steps WHERE execution_id = _execution_id;

  IF e.executor_type = 'HUMAN' THEN
    v_expected := 0;
    v_complete := 'COMPLETE';
  ELSIF e.step_write_failure_count > 0 OR v_steps < v_expected THEN
    v_complete := 'PARTIAL';
  ELSE
    v_complete := 'COMPLETE';
  END IF;

  RETURN jsonb_build_object(
    'executionId', _execution_id,
    'recordedSteps', v_steps,
    'expectedSteps', v_expected,
    'stepWriteFailureCount', e.step_write_failure_count,
    'evidenceCompleteness', v_complete,
    'gap', GREATEST(v_expected - v_steps, 0)
  );
END $$;

-- ---------------------------------------------------------------------------
-- G. Bounded graph backfill (does NOT invent historical junctions)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.go4_execution_graph_backfill(_tenant_id uuid, _limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  n_exec int := 0;
  n_link int := 0;
BEGIN
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_tenant_member(_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  _limit := GREATEST(1, LEAST(COALESCE(_limit, 200), 2000));

  FOR r IN
    SELECT id FROM public.ai_task_executions
     WHERE tenant_id = _tenant_id
     ORDER BY created_at
     LIMIT _limit
  LOOP
    PERFORM public._touch_execution_graph_node(r.id);
    n_exec := n_exec + 1;
  END LOOP;

  FOR r IN
    SELECT execution_id, work_product_id FROM public.execution_work_products
     WHERE tenant_id = _tenant_id
     ORDER BY created_at
     LIMIT _limit
  LOOP
    PERFORM public._go4_project_execution_produces(r.execution_id, r.work_product_id);
    n_link := n_link + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'executionsProjected', n_exec,
    'linksProjected', n_link
  );
END $$;
REVOKE ALL ON FUNCTION public.go4_execution_graph_backfill(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.go4_execution_graph_backfill(uuid, integer) TO postgres, service_role, authenticated;
