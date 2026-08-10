-- 1. Step type catalogue (system-wide)
CREATE TABLE public.workflow_step_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label_vi text NOT NULL,
  label_en text NOT NULL,
  description_vi text,
  description_en text,
  icon text NOT NULL DEFAULT 'circle',
  color text NOT NULL DEFAULT 'muted',
  default_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 100,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.workflow_step_types TO authenticated;
GRANT ALL ON public.workflow_step_types TO service_role;
ALTER TABLE public.workflow_step_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "step types readable by authenticated"
  ON public.workflow_step_types FOR SELECT TO authenticated USING (true);

INSERT INTO public.workflow_step_types (code, label_vi, label_en, description_vi, description_en, icon, color, default_config, sort_order) VALUES
  ('trigger','Khởi động','Trigger','Điểm bắt đầu của quy trình khi có sự kiện hoặc lịch chạy.','Entry point fired by a schedule or event.','zap','warning','{"on_error":"stop"}'::jsonb, 10),
  ('ai','AI xử lý','AI step','Gọi trợ lý AI để tóm tắt, phân loại hoặc soạn nội dung.','Call the AI assistant to summarise, classify or draft content.','sparkles','primary','{"on_error":"stop","model":"default"}'::jsonb, 20),
  ('branch','Điều kiện','Branch','Rẽ nhánh theo điều kiện dữ liệu đầu vào.','Branch based on input data conditions.','git-branch','accent','{"on_error":"stop"}'::jsonb, 30),
  ('action','Hành động','Action','Ghi hoặc cập nhật dữ liệu nghiệp vụ (task, tài liệu, ...).','Write or update business data (tasks, documents, ...).','database','success','{"on_error":"stop"}'::jsonb, 40),
  ('notify','Thông báo','Notify','Gửi thông báo hoặc email tới người liên quan.','Send a notification or email to stakeholders.','mail','success','{"on_error":"skip"}'::jsonb, 50),
  ('end','Kết thúc','End','Kết thúc quy trình và ghi nhận kết quả.','Finish the workflow and record the outcome.','check-circle','muted','{}'::jsonb, 60);

-- 2. Archive / restore workflow
CREATE OR REPLACE FUNCTION public.archive_workflow(
  _workflow_id uuid,
  _archived boolean DEFAULT true,
  _idempotency_key text DEFAULT NULL,
  _correlation_id text DEFAULT NULL
) RETURNS public.workflows
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _wf public.workflows;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _wf FROM public.workflows WHERE id = _workflow_id AND deleted_at IS NULL;
  IF _wf.id IS NULL THEN RAISE EXCEPTION 'WORKFLOW_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_wf.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT public.has_workflow_permission(_wf.workspace_id, _actor, 'edit') THEN
    RAISE EXCEPTION 'WORKFLOW_EDIT_DENIED' USING ERRCODE='42501';
  END IF;

  UPDATE public.workflows
     SET status = CASE WHEN _archived THEN 'archived'::public.workflow_status ELSE 'draft'::public.workflow_status END,
         updated_by = _actor
   WHERE id = _workflow_id RETURNING * INTO _wf;

  PERFORM public._emit_outbox_event(
    _wf.tenant_id,
    CASE WHEN _archived THEN 'workflow.workflow.archived' ELSE 'workflow.workflow.restored' END,
    'workflow', _wf.id::text,
    jsonb_build_object('workflow_id', _wf.id, 'actor_id', _actor),
    _idempotency_key, _correlation_id);
  RETURN _wf;
END $$;
REVOKE ALL ON FUNCTION public.archive_workflow(uuid, boolean, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.archive_workflow(uuid, boolean, text, text) TO authenticated;

-- 3. Soft delete workflow
CREATE OR REPLACE FUNCTION public.delete_workflow(
  _workflow_id uuid,
  _idempotency_key text DEFAULT NULL,
  _correlation_id text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _wf public.workflows;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _wf FROM public.workflows WHERE id = _workflow_id AND deleted_at IS NULL;
  IF _wf.id IS NULL THEN RETURN false; END IF;
  IF NOT public.is_tenant_member(_wf.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT public.has_workflow_permission(_wf.workspace_id, _actor, 'edit') THEN
    RAISE EXCEPTION 'WORKFLOW_EDIT_DENIED' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.workflow_runs r WHERE r.workflow_id = _workflow_id AND r.status IN ('pending','running')) THEN
    RAISE EXCEPTION 'WORKFLOW_HAS_ACTIVE_RUNS' USING ERRCODE='22023';
  END IF;

  UPDATE public.workflows
     SET deleted_at = now(), status = 'archived'::public.workflow_status, updated_by = _actor
   WHERE id = _workflow_id;

  UPDATE public.workflow_triggers SET is_enabled = false, next_run_at = NULL WHERE workflow_id = _workflow_id;

  PERFORM public._emit_outbox_event(_wf.tenant_id, 'workflow.workflow.deleted', 'workflow', _wf.id::text,
    jsonb_build_object('workflow_id', _wf.id, 'actor_id', _actor), _idempotency_key, _correlation_id);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.delete_workflow(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_workflow(uuid, text, text) TO authenticated;