
-- ===== Module Cam kết (Commitments): trạng thái, người theo dõi, timeline, nối Work Graph =====

CREATE TABLE public.commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  counterparty text, -- khách hàng / đối tác bên ngoài
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','FULFILLED','BROKEN','CANCELED')),
  owner_id uuid, -- người theo dõi cam kết
  due_at timestamptz,
  source_type text, -- IMPORT | CHAT_CHANNEL | MEETING | NULL (nhập tay)
  source_id uuid,
  source_excerpt text,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX commitments_tenant_status_idx ON public.commitments (tenant_id, status);
CREATE INDEX commitments_owner_idx ON public.commitments (tenant_id, owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commitments TO authenticated;
GRANT ALL ON public.commitments TO service_role;

ALTER TABLE public.commitments ENABLE ROW LEVEL SECURITY;
CREATE POLICY commitments_tenant_select ON public.commitments FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
CREATE POLICY commitments_tenant_insert ON public.commitments FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY commitments_tenant_update ON public.commitments FOR UPDATE TO authenticated
  USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));

CREATE TABLE public.commitment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id uuid NOT NULL REFERENCES public.commitments(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('CREATED','STATUS_CHANGED','NOTE')),
  from_status text,
  to_status text,
  note text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commitment_events_commitment_idx ON public.commitment_events (commitment_id, created_at);

GRANT SELECT, INSERT ON public.commitment_events TO authenticated;
GRANT ALL ON public.commitment_events TO service_role;

ALTER TABLE public.commitment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY commitment_events_tenant_select ON public.commitment_events FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));
CREATE POLICY commitment_events_tenant_insert ON public.commitment_events FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id));

-- ===== RPC (một writer, ghi audit + timeline trong cùng giao dịch) =====

CREATE OR REPLACE FUNCTION public.create_commitment(
  _workspace_id uuid,
  _title text,
  _description text DEFAULT NULL,
  _counterparty text DEFAULT NULL,
  _owner_id uuid DEFAULT NULL,
  _due_at timestamptz DEFAULT NULL,
  _source_type text DEFAULT NULL,
  _source_id uuid DEFAULT NULL,
  _source_excerpt text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_id uuid;
BEGIN
  v_tenant := public.current_tenant_id();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'TENANT_REQUIRED' USING ERRCODE = 'P0001'; END IF;
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO v_id FROM public.commitments
     WHERE tenant_id = v_tenant AND title = _title
       AND COALESCE(source_type,'') = COALESCE(_source_type,'')
       AND COALESCE(source_id::text,'') = COALESCE(_source_id::text,'')
       AND created_by = auth.uid()
     ORDER BY created_at DESC LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  INSERT INTO public.commitments (tenant_id, workspace_id, title, description, counterparty, owner_id, due_at, source_type, source_id, source_excerpt, created_by, updated_by)
  VALUES (v_tenant, _workspace_id, _title, _description, _counterparty, COALESCE(_owner_id, auth.uid()), _due_at, _source_type, _source_id, _source_excerpt, auth.uid(), auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.commitment_events (commitment_id, tenant_id, event_type, to_status, actor_id)
  VALUES (v_id, v_tenant, 'CREATED', 'OPEN', auth.uid());
  INSERT INTO public.audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, payload)
  VALUES (v_tenant, auth.uid(), 'COMMITMENT_CREATED', 'COMMITMENT', v_id, jsonb_build_object('title', _title));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.list_commitments(
  _status text DEFAULT NULL,
  _owner_id uuid DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
) RETURNS TABLE (
  id uuid, workspace_id uuid, title text, description text, counterparty text,
  status text, owner_id uuid, due_at timestamptz, source_type text, source_id uuid,
  source_excerpt text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  v_tenant := public.current_tenant_id();
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'TENANT_REQUIRED' USING ERRCODE = 'P0001'; END IF;
  RETURN QUERY
  SELECT c.id, c.workspace_id, c.title, c.description, c.counterparty, c.status, c.owner_id,
         c.due_at, c.source_type, c.source_id, c.source_excerpt, c.created_at, c.updated_at
  FROM public.commitments c
  WHERE c.tenant_id = v_tenant
    AND (_status IS NULL OR c.status = _status)
    AND (_owner_id IS NULL OR c.owner_id = _owner_id)
  ORDER BY c.created_at DESC
  LIMIT LEAST(_limit, 200) OFFSET _offset;
END $$;

CREATE OR REPLACE FUNCTION public.set_commitment_status(
  _commitment_id uuid,
  _status text,
  _note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_old text;
BEGIN
  IF _status NOT IN ('OPEN','IN_PROGRESS','FULFILLED','BROKEN','CANCELED') THEN
    RAISE EXCEPTION 'COMMITMENT_STATUS_INVALID' USING ERRCODE = 'P0001';
  END IF;
  SELECT c.tenant_id, c.status INTO v_tenant, v_old FROM public.commitments c WHERE c.id = _commitment_id;
  IF v_tenant IS NULL OR NOT public.is_tenant_member(v_tenant) THEN
    RAISE EXCEPTION 'COMMITMENT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_old = _status THEN RETURN; END IF;
  UPDATE public.commitments
     SET status = _status, updated_at = now(), updated_by = auth.uid(), row_version = row_version + 1
   WHERE id = _commitment_id;
  INSERT INTO public.commitment_events (commitment_id, tenant_id, event_type, from_status, to_status, note, actor_id)
  VALUES (_commitment_id, v_tenant, 'STATUS_CHANGED', v_old, _status, _note, auth.uid());
  INSERT INTO public.audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, payload)
  VALUES (v_tenant, auth.uid(), 'COMMITMENT_STATUS_CHANGED', 'COMMITMENT', _commitment_id,
          jsonb_build_object('from', v_old, 'to', _status));
END $$;

CREATE OR REPLACE FUNCTION public.add_commitment_note(_commitment_id uuid, _note text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_id uuid;
BEGIN
  SELECT c.tenant_id INTO v_tenant FROM public.commitments c WHERE c.id = _commitment_id;
  IF v_tenant IS NULL OR NOT public.is_tenant_member(v_tenant) THEN
    RAISE EXCEPTION 'COMMITMENT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.commitment_events (commitment_id, tenant_id, event_type, note, actor_id)
  VALUES (_commitment_id, v_tenant, 'NOTE', _note, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.list_commitment_events(_commitment_id uuid)
RETURNS TABLE (id uuid, event_type text, from_status text, to_status text, note text, actor_id uuid, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT c.tenant_id INTO v_tenant FROM public.commitments c WHERE c.id = _commitment_id;
  IF v_tenant IS NULL OR NOT public.is_tenant_member(v_tenant) THEN
    RAISE EXCEPTION 'COMMITMENT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY
  SELECT e.id, e.event_type, e.from_status, e.to_status, e.note, e.actor_id, e.created_at
  FROM public.commitment_events e WHERE e.commitment_id = _commitment_id ORDER BY e.created_at;
END $$;

-- ===== Nối Work Graph hiện có: thêm loại thực thể COMMITMENT =====

ALTER TABLE public.work_nodes DROP CONSTRAINT work_nodes_entity_type_check;
ALTER TABLE public.work_nodes ADD CONSTRAINT work_nodes_entity_type_check
  CHECK (entity_type = ANY (ARRAY['TENANT','WORKSPACE','TASK','PERSON','MEETING','CHAT_CHANNEL','DOCUMENT','EMAIL','MEETING_ARTIFACT','WORK_PRODUCT','EXECUTION','DECISION','COMMITMENT']));

CREATE OR REPLACE FUNCTION public._work_entity_scope(_entity_type text, _entity_id uuid)
RETURNS TABLE(tenant_id uuid, workspace_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    WHEN 'DECISION' THEN RETURN QUERY SELECT d.tenant_id, d.workspace_id FROM public.decisions d WHERE d.id = _entity_id;
    WHEN 'COMMITMENT' THEN RETURN QUERY SELECT c.tenant_id, c.workspace_id FROM public.commitments c WHERE c.id = _entity_id;
    ELSE RETURN;
  END CASE;
END $$;

CREATE OR REPLACE FUNCTION public.can_view_work_entity(_entity_type text, _entity_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    WHEN 'DECISION' THEN
      SELECT EXISTS(SELECT 1 FROM public.decisions d WHERE d.id = _entity_id) INTO ok;
    WHEN 'COMMITMENT' THEN
      SELECT EXISTS(SELECT 1 FROM public.commitments c WHERE c.id = _entity_id AND public.is_tenant_member(c.tenant_id)) INTO ok;
    ELSE ok := false;
  END CASE;
  RETURN COALESCE(ok, false);
END $$;

INSERT INTO public.work_relationship_types (code, source_type, target_type, user_creatable, system_creatable) VALUES
  ('BELONGS_TO', 'COMMITMENT', 'WORKSPACE', false, true),
  ('RELATED_TO', 'COMMITMENT', 'TASK', true, true),
  ('RELATED_TO', 'TASK', 'COMMITMENT', true, true),
  ('RELATED_TO', 'COMMITMENT', 'DECISION', true, true),
  ('RELATED_TO', 'COMMITMENT', 'WORK_PRODUCT', true, true)
ON CONFLICT DO NOTHING;
