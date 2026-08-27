-- WE-2 — WORK CATALOG & OUTCOME CONTRACT (evolve public.work_units into a versioned Work Product Contract)

/* 1. Contract columns -------------------------------------------------- */
ALTER TABLE public.work_units
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'WORK_INTELLIGENCE',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS input_contract jsonb NOT NULL DEFAULT '{"required":[],"properties":{}}'::jsonb,
  ADD COLUMN IF NOT EXISTS context_contract jsonb NOT NULL DEFAULT '{"allowedEntityTypes":[],"optionalEntityTypes":[],"maxSources":20}'::jsonb,
  ADD COLUMN IF NOT EXISTS executor_contract jsonb NOT NULL DEFAULT '{"requiredRole":null,"requiredSkills":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS action_contract jsonb NOT NULL DEFAULT '{"allowedActions":[],"maxAutonomy":"PROPOSE_ONLY"}'::jsonb,
  ADD COLUMN IF NOT EXISTS deliverable_contract jsonb NOT NULL DEFAULT '{"requiredSections":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS acceptance_contract jsonb NOT NULL DEFAULT '{"mandatoryCriteria":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS quality_contract jsonb NOT NULL DEFAULT '{"minimumQualityScore":75,"requiredDimensions":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS review_contract jsonb NOT NULL DEFAULT '{"policy":"HUMAN_REVIEW_REQUIRED"}'::jsonb,
  ADD COLUMN IF NOT EXISTS sla_contract jsonb NOT NULL DEFAULT '{"machineDurationMs":null,"wallDurationMs":null}'::jsonb,
  ADD COLUMN IF NOT EXISTS contract_hash text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.work_units DROP CONSTRAINT IF EXISTS work_units_status_chk;
ALTER TABLE public.work_units ADD CONSTRAINT work_units_status_chk
  CHECK (status IN ('DRAFT','ACTIVE','PAUSED','RETIRED'));

/* 2. Versioning: primary key becomes (code, version) -------------------- */
ALTER TABLE public.work_units DROP CONSTRAINT IF EXISTS work_units_pkey CASCADE;
ALTER TABLE public.work_units DROP CONSTRAINT IF EXISTS work_units_template_code_key;
ALTER TABLE public.work_units ADD CONSTRAINT work_units_pkey PRIMARY KEY (code, version);
CREATE UNIQUE INDEX IF NOT EXISTS work_units_template_version_idx ON public.work_units (template_code, version);
CREATE INDEX IF NOT EXISTS work_units_status_idx ON public.work_units (status);

/* 3. Deterministic contract fingerprint --------------------------------- */
CREATE OR REPLACE FUNCTION public.work_product_contract_payload(_r public.work_units)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'code', _r.code,
    'version', _r.version,
    'label', _r.label,
    'objective', _r.objective,
    'category', _r.category,
    'deliverableType', _r.deliverable_type,
    'outcomeType', _r.expected_outcome_type,
    'inputContract', _r.input_contract,
    'contextContract', _r.context_contract,
    'executorContract', _r.executor_contract,
    'actionContract', _r.action_contract,
    'deliverableContract', _r.deliverable_contract,
    'acceptanceContract', _r.acceptance_contract,
    'qualityContract', _r.quality_contract,
    'reviewContract', _r.review_contract,
    'slaContract', _r.sla_contract,
    'slaMachineMs', _r.sla_machine_ms
  )
$$;

CREATE OR REPLACE FUNCTION public.work_units_stamp()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.contract_hash := md5(public.work_product_contract_payload(NEW)::text);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS work_units_stamp_trg ON public.work_units;
CREATE TRIGGER work_units_stamp_trg BEFORE INSERT OR UPDATE ON public.work_units
  FOR EACH ROW EXECUTE FUNCTION public.work_units_stamp();

/* 4. Execution binding: immutable contract snapshot per execution ------- */
ALTER TABLE public.ai_task_executions
  ADD COLUMN IF NOT EXISTS work_unit_code text,
  ADD COLUMN IF NOT EXISTS work_unit_version integer,
  ADD COLUMN IF NOT EXISTS contract_hash text,
  ADD COLUMN IF NOT EXISTS contract_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS work_product_inputs jsonb;

CREATE INDEX IF NOT EXISTS ai_task_executions_work_unit_idx
  ON public.ai_task_executions (work_unit_code, work_unit_version);

/* 5. Historical contract immutability ----------------------------------- */
CREATE OR REPLACE FUNCTION public.work_units_guard_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_used boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.ai_task_executions
    WHERE work_unit_code = OLD.code AND work_unit_version = OLD.version
  ) INTO v_used;

  IF v_used AND public.work_product_contract_payload(NEW) IS DISTINCT FROM public.work_product_contract_payload(OLD) THEN
    -- Chỉ cho phép đổi trạng thái vòng đời; ngữ nghĩa hợp đồng lịch sử là bất biến.
    RAISE EXCEPTION 'WORK_PRODUCT_CONTRACT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS work_units_immutability_trg ON public.work_units;
CREATE TRIGGER work_units_immutability_trg BEFORE UPDATE ON public.work_units
  FOR EACH ROW EXECUTE FUNCTION public.work_units_guard_immutability();

/* 6. Bind RPC: snapshot resolved server-side, one time only ------------- */
CREATE OR REPLACE FUNCTION public.bind_work_product_execution(
  _execution_id uuid,
  _code text,
  _version integer,
  _inputs jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.ai_task_executions%ROWTYPE;
  wu public.work_units%ROWTYPE;
  v_payload jsonb;
BEGIN
  SELECT * INTO e FROM public.ai_task_executions WHERE id = _execution_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'EXECUTION_NOT_FOUND'; END IF;
  IF NOT public.is_tenant_member(e.tenant_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT * INTO wu FROM public.work_units WHERE code = _code AND version = _version;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_WORK_PRODUCT_VERSION'; END IF;

  IF e.work_unit_code IS NOT NULL THEN
    RETURN jsonb_build_object('bound', false, 'reason', 'ALREADY_BOUND',
      'workUnitCode', e.work_unit_code, 'workUnitVersion', e.work_unit_version, 'contractHash', e.contract_hash);
  END IF;

  v_payload := public.work_product_contract_payload(wu);

  UPDATE public.ai_task_executions
     SET work_unit_code = wu.code,
         work_unit_version = wu.version,
         contract_hash = wu.contract_hash,
         contract_snapshot = v_payload,
         work_product_inputs = COALESCE(_inputs, '{}'::jsonb)
   WHERE id = _execution_id;

  RETURN jsonb_build_object('bound', true, 'workUnitCode', wu.code, 'workUnitVersion', wu.version,
    'contractHash', wu.contract_hash, 'contract', v_payload);
END;
$$;
REVOKE ALL ON FUNCTION public.bind_work_product_execution(uuid, text, integer, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.bind_work_product_execution(uuid, text, integer, jsonb) TO authenticated, service_role;

/* 7. Metrics: prefer the bound contract snapshot over template lookup --- */
CREATE OR REPLACE FUNCTION public.resolve_work_unit_for_execution(_execution_id uuid)
RETURNS public.work_units
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.ai_task_executions%ROWTYPE;
  wu public.work_units%ROWTYPE;
BEGIN
  SELECT * INTO e FROM public.ai_task_executions WHERE id = _execution_id;
  IF NOT FOUND THEN RETURN wu; END IF;
  IF e.work_unit_code IS NOT NULL THEN
    SELECT * INTO wu FROM public.work_units WHERE code = e.work_unit_code AND version = e.work_unit_version;
    RETURN wu;
  END IF;
  SELECT * INTO wu FROM public.work_units
   WHERE template_code = e.template_code AND status = 'ACTIVE'
   ORDER BY version DESC LIMIT 1;
  RETURN wu;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_work_unit_for_execution(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.resolve_work_unit_for_execution(uuid) TO authenticated, service_role;

/* 8. Per-product economics rollup --------------------------------------- */
CREATE OR REPLACE FUNCTION public.work_product_summary(
  _tenant_id uuid,
  _from timestamptz DEFAULT (now() - interval '90 days'),
  _to timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_tenant_member(_tenant_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT COALESCE(jsonb_agg(r ORDER BY r->>'workUnitCode'), '[]'::jsonb) INTO v
  FROM (
    SELECT jsonb_build_object(
      'workUnitCode', work_unit_code,
      'workUnitVersion', work_unit_version,
      'runs', COUNT(*),
      'acceptedRuns', COUNT(*) FILTER (WHERE outcome_accepted),
      'verifiedOutcomes', COUNT(*) FILTER (WHERE outcome_verified),
      'qualityPassedRuns', COUNT(*) FILTER (WHERE quality_passed),
      'humanApprovals', COALESCE(SUM(human_confirmations), 0),
      'revisions', COALESCE(SUM(revision_count), 0),
      'machineMsP50', percentile_disc(0.5) WITHIN GROUP (ORDER BY machine_duration_ms),
      'slaMetRuns', COUNT(*) FILTER (WHERE sla_met),
      'slaEvaluatedRuns', COUNT(*) FILTER (WHERE sla_met IS NOT NULL)
    ) AS r
    FROM public.work_execution_metrics
    WHERE tenant_id = _tenant_id AND computed_at >= _from AND computed_at <= _to
    GROUP BY work_unit_code, work_unit_version
  ) s;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.work_product_summary(uuid, timestamptz, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.work_product_summary(uuid, timestamptz, timestamptz) TO authenticated, service_role;

/* 9. Normalize the four existing catalog entries into explicit contracts - */
UPDATE public.work_units SET
  label = 'Weekly Project Intelligence',
  description = 'Biến ngữ cảnh dự án đang chạy thành báo cáo điều hành hằng tuần có trích dẫn.',
  category = 'PROJECT_INTELLIGENCE',
  status = 'ACTIVE',
  input_contract = '{"required":["project_id"],"properties":{"project_id":{"type":"uuid","entityType":"PROJECT"},"date_range":{"type":"date_range"},"focus_area":{"type":"text"}}}'::jsonb,
  context_contract = '{"allowedEntityTypes":["PROJECT","TASK","MEETING","DECISION","DOCUMENT"],"optionalEntityTypes":["CHAT","EMAIL"],"maxSources":20}'::jsonb,
  executor_contract = '{"requiredRole":"PROJECT_ANALYST","requiredSkills":["SUMMARIZE_WORK"]}'::jsonb,
  action_contract = '{"allowedActions":[],"maxAutonomy":"PROPOSE_ONLY"}'::jsonb,
  deliverable_contract = '{"type":"REPORT","requiredSections":["EXECUTIVE_SUMMARY","CURRENT_STATUS","OVERDUE_AND_BLOCKED","RISKS","RECOMMENDED_ACTIONS","SOURCES"]}'::jsonb,
  acceptance_contract = '{"mandatoryCriteria":["Tóm tắt hiện trạng dự án.","Chỉ ra công việc trễ hạn hoặc bị chặn.","Nêu rủi ro trọng yếu.","Đề xuất hành động tiếp theo.","Mọi khẳng định trọng yếu đều dẫn nguồn UniWork được phép truy cập."]}'::jsonb,
  quality_contract = '{"minimumQualityScore":80,"requiredDimensions":["acceptanceCriteria","evidenceGrounding","completeness","consistency"]}'::jsonb,
  review_contract = '{"policy":"HUMAN_REVIEW_REQUIRED"}'::jsonb,
  sla_contract = '{"machineDurationMs":180000,"wallDurationMs":null}'::jsonb,
  expected_outcome_type = 'REPORT_ACCEPTED'
WHERE code = 'WEEKLY_PROJECT_INTELLIGENCE';

UPDATE public.work_units SET
  description = 'Nhận diện rủi ro dự án và khuyến nghị xử lý dựa trên dữ liệu thật.',
  category = 'PROJECT_INTELLIGENCE',
  status = 'ACTIVE',
  input_contract = '{"required":["project_id"],"properties":{"project_id":{"type":"uuid","entityType":"PROJECT"}}}'::jsonb,
  context_contract = '{"allowedEntityTypes":["PROJECT","TASK","MEETING","DECISION","DOCUMENT"],"optionalEntityTypes":[],"maxSources":20}'::jsonb,
  executor_contract = '{"requiredRole":null,"requiredSkills":["SUMMARIZE_WORK"]}'::jsonb,
  action_contract = '{"allowedActions":[],"maxAutonomy":"PROPOSE_ONLY"}'::jsonb,
  deliverable_contract = '{"type":"ANALYSIS","requiredSections":["CONTEXT","ANALYSIS","RISKS","RECOMMENDATIONS"]}'::jsonb,
  acceptance_contract = '{"mandatoryCriteria":["Nêu rủi ro trọng yếu kèm tác động.","Khuyến nghị biện pháp xử lý.","Mọi khẳng định trọng yếu đều dẫn nguồn."]}'::jsonb,
  quality_contract = '{"minimumQualityScore":80,"requiredDimensions":["acceptanceCriteria","evidenceGrounding","completeness","consistency"]}'::jsonb,
  review_contract = '{"policy":"HUMAN_REVIEW_REQUIRED"}'::jsonb,
  sla_contract = '{"machineDurationMs":240000,"wallDurationMs":null}'::jsonb,
  expected_outcome_type = 'PROJECT_RISK_IDENTIFIED'
WHERE code = 'PROJECT_RISK_ANALYSIS';

UPDATE public.work_units SET
  description = 'Biến quyết định cuộc họp thành danh sách việc cần làm có chủ sở hữu.',
  category = 'MEETING_EXECUTION',
  status = 'ACTIVE',
  input_contract = '{"required":[],"properties":{"meeting_id":{"type":"uuid","entityType":"MEETING"},"project_id":{"type":"uuid","entityType":"PROJECT"}}}'::jsonb,
  context_contract = '{"allowedEntityTypes":["MEETING","DECISION","TASK","PROJECT"],"optionalEntityTypes":["DOCUMENT"],"maxSources":20}'::jsonb,
  executor_contract = '{"requiredRole":null,"requiredSkills":["SUMMARIZE_WORK"]}'::jsonb,
  action_contract = '{"allowedActions":["CREATE_TASK"],"maxAutonomy":"EXECUTE_WITH_APPROVAL"}'::jsonb,
  deliverable_contract = '{"type":"PLAN","requiredSections":["DECISIONS","ACTION_ITEMS","OPEN_ISSUES"]}'::jsonb,
  acceptance_contract = '{"mandatoryCriteria":["Liệt kê quyết định đã chốt.","Liệt kê việc cần làm kèm người chịu trách nhiệm hoặc hạn.","Mọi khẳng định trọng yếu đều dẫn nguồn."]}'::jsonb,
  quality_contract = '{"minimumQualityScore":75,"requiredDimensions":["acceptanceCriteria","evidenceGrounding","completeness"]}'::jsonb,
  review_contract = '{"policy":"HUMAN_REVIEW_REQUIRED"}'::jsonb,
  sla_contract = '{"machineDurationMs":180000,"wallDurationMs":null}'::jsonb,
  expected_outcome_type = 'MEETING_ACTIONS_CAPTURED'
WHERE code = 'MEETING_TO_EXECUTION';

UPDATE public.work_units SET
  description = 'Tổng hợp phát hiện và khoảng trống dữ liệu cho một chủ đề nghiên cứu.',
  category = 'KNOWLEDGE',
  status = 'ACTIVE',
  input_contract = '{"required":[],"properties":{"project_id":{"type":"uuid","entityType":"PROJECT"},"focus_area":{"type":"text"}}}'::jsonb,
  context_contract = '{"allowedEntityTypes":["DOCUMENT","PROJECT","TASK","MEETING"],"optionalEntityTypes":["CHAT","EMAIL"],"maxSources":20}'::jsonb,
  executor_contract = '{"requiredRole":null,"requiredSkills":["SUMMARIZE_WORK"]}'::jsonb,
  action_contract = '{"allowedActions":[],"maxAutonomy":"PROPOSE_ONLY"}'::jsonb,
  deliverable_contract = '{"type":"DRAFT","requiredSections":["RESEARCH_QUESTION","KEY_FINDINGS","DATA_GAPS","RECOMMENDATIONS"]}'::jsonb,
  acceptance_contract = '{"mandatoryCriteria":["Nêu phát hiện chính.","Chỉ rõ khoảng trống dữ liệu.","Mọi khẳng định trọng yếu đều dẫn nguồn."]}'::jsonb,
  quality_contract = '{"minimumQualityScore":75,"requiredDimensions":["acceptanceCriteria","evidenceGrounding","completeness"]}'::jsonb,
  review_contract = '{"policy":"HUMAN_REVIEW_REQUIRED"}'::jsonb,
  sla_contract = '{"machineDurationMs":240000,"wallDurationMs":null}'::jsonb,
  expected_outcome_type = 'REPORT_ACCEPTED'
WHERE code = 'RESEARCH_BRIEF';

-- ép tính contract_hash cho mọi dòng hiện có
UPDATE public.work_units SET updated_at = now() WHERE contract_hash IS NULL;