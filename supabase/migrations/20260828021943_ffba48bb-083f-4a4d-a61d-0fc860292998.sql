-- SWP-1: Sell Work Productization & Runtime Cohort Proof

-- 1) Phân loại lượt chạy cho cohort (thật / tổng hợp / kiểm thử)
ALTER TABLE public.ai_task_executions
  ADD COLUMN IF NOT EXISTS cohort_class text NOT NULL DEFAULT 'REAL',
  ADD COLUMN IF NOT EXISTS cohort_exclusion_reason text;

DO $$ BEGIN
  ALTER TABLE public.ai_task_executions
    ADD CONSTRAINT ai_task_executions_cohort_class_chk
    CHECK (cohort_class IN ('REAL','SYNTHETIC','TEST'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS ai_task_executions_cohort_idx
  ON public.ai_task_executions (work_unit_code, work_unit_version, cohort_class, created_at DESC);

-- 2) Tín hiệu tự báo cáo của người dùng (KHÔNG trộn với đo lường hệ thống)
CREATE TABLE IF NOT EXISTS public.work_execution_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.ai_task_executions(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  work_unit_code text,
  work_unit_version integer,
  usefulness text NOT NULL CHECK (usefulness IN ('USEFUL','PARTIALLY_USEFUL','NOT_USEFUL')),
  would_use_again text NOT NULL CHECK (would_use_again IN ('YES','MAYBE','NO')),
  estimated_time_saved_minutes integer CHECK (estimated_time_saved_minutes >= 0 AND estimated_time_saved_minutes <= 10000),
  comment text,
  segment_industry text,
  segment_team_size text,
  design_partner boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (execution_id, created_by)
);

GRANT SELECT, INSERT, UPDATE ON public.work_execution_feedback TO authenticated;
GRANT ALL ON public.work_execution_feedback TO service_role;
ALTER TABLE public.work_execution_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wef_select ON public.work_execution_feedback;
CREATE POLICY wef_select ON public.work_execution_feedback FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS wef_insert ON public.work_execution_feedback;
CREATE POLICY wef_insert ON public.work_execution_feedback FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_tenant_member(tenant_id));

DROP POLICY IF EXISTS wef_update ON public.work_execution_feedback;
CREATE POLICY wef_update ON public.work_execution_feedback FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND public.is_tenant_member(tenant_id))
  WITH CHECK (created_by = auth.uid() AND public.is_tenant_member(tenant_id));

-- 3) Ba hợp đồng sản phẩm flagship (bất biến theo phiên bản)
INSERT INTO public.work_units (
  code, version, template_code, label, description, objective, category, status,
  deliverable_type, expected_outcome_type, sla_machine_ms,
  input_contract, context_contract, executor_contract, action_contract,
  deliverable_contract, acceptance_contract, quality_contract, review_contract, sla_contract
) VALUES
(
  'WPI_V1', 1, 'WPI_WEEKLY_INTELLIGENCE',
  'Thông tin dự án hằng tuần',
  'Mỗi tuần, cung cấp cho người phụ trách dự án bức tranh ngắn gọn, đáng tin về những gì đã thay đổi, rủi ro, quyết định đang chờ và việc cần chú ý.',
  'Tổng hợp diễn biến dự án theo tuần với bằng chứng truy vết được, không suy đoán trạng thái.',
  'PROJECT_INTELLIGENCE', 'ACTIVE', 'SUMMARY', 'PROJECT_INTELLIGENCE_DELIVERED', 180000,
  '{"required":["project_id"],"properties":{"project_id":{"type":"uuid","entityType":"PROJECT"},"reporting_period":{"type":"date_range"},"focus_areas":{"type":"text"},"comparison_period":{"type":"date_range"},"executive_mode":{"type":"text"}}}'::jsonb,
  '{"allowedEntityTypes":["PROJECT","TASK","MEETING","DOCUMENT","PERSON"],"optionalEntityTypes":["EMAIL","CHAT"],"maxSources":20}'::jsonb,
  '{"requiredRole":null,"requiredSkills":["SUMMARIZE_WORK"]}'::jsonb,
  '{"allowedActions":[],"maxAutonomy":"PROPOSE_ONLY"}'::jsonb,
  '{"type":"SUMMARY","requiredSections":["Tóm tắt điều hành","Thay đổi trong tuần","Tiến độ","Rủi ro","Điểm nghẽn","Quyết định đang chờ","Cam kết","Cần chú ý","Hành động đề xuất","Bằng chứng / Nguồn"]}'::jsonb,
  '{"mandatoryCriteria":["Mọi khẳng định quan trọng có nguồn","Không bịa trạng thái","Không bịa người phụ trách","Không bịa hạn chót","Rủi ro có bằng chứng","Phân biệt sự kiện và suy luận","Hành động đề xuất được đánh dấu là khuyến nghị","Không dữ liệu ngoài tổ chức"]}'::jsonb,
  '{"minimumQualityScore":75,"requiredDimensions":["GROUNDING","COMPLETENESS","ACTIONABILITY"]}'::jsonb,
  '{"policy":"HUMAN_REVIEW_REQUIRED"}'::jsonb,
  '{"machineDurationMs":180000,"wallDurationMs":900000}'::jsonb
),
(
  'MTE_V1', 1, 'MTE_EXECUTION_PACKAGE',
  'Chuyển cuộc họp thành công việc',
  'Biến một cuộc họp đã kết thúc thành quyết định, cam kết, đầu việc và đề xuất hành động có kiểm soát.',
  'Chuyển thông tin cuộc họp thành gói thực thi có bằng chứng, mọi hành động ghi dữ liệu đều chờ người xác nhận.',
  'MEETING_EXECUTION', 'ACTIVE', 'PLAN', 'MEETING_EXECUTION_PACKAGE_ACCEPTED', 180000,
  '{"required":["meeting_id"],"properties":{"meeting_id":{"type":"uuid","entityType":"MEETING"},"target_project_id":{"type":"uuid","entityType":"PROJECT"},"execution_policy":{"type":"text"},"include_followup_draft":{"type":"text"}}}'::jsonb,
  '{"allowedEntityTypes":["MEETING","TASK","PROJECT","PERSON"],"optionalEntityTypes":["DOCUMENT"],"maxSources":20}'::jsonb,
  '{"requiredRole":null,"requiredSkills":["SUMMARIZE_WORK"]}'::jsonb,
  '{"allowedActions":["CREATE_TASK","UPDATE_TASK_FIELDS","CREATE_MEETING","CREATE_EMAIL_DRAFT"],"maxAutonomy":"PROPOSE_ONLY"}'::jsonb,
  '{"type":"PLAN","requiredSections":["Tóm tắt cuộc họp","Quyết định","Cam kết","Đầu việc","Câu hỏi chưa giải quyết","Việc cần theo dõi","Đề xuất hành động"]}'::jsonb,
  '{"mandatoryCriteria":["Quyết định truy vết được tới biên bản/bằng chứng","Cam kết truy vết được","Không bịa người thực hiện","Không coi hạn chót suy đoán là sự thật","Tránh trùng lặp đầu việc đã có","Mọi đề xuất hành động phải chờ người xác nhận"]}'::jsonb,
  '{"minimumQualityScore":75,"requiredDimensions":["GROUNDING","COMPLETENESS","ACTIONABILITY"]}'::jsonb,
  '{"policy":"HUMAN_REVIEW_REQUIRED"}'::jsonb,
  '{"machineDurationMs":180000,"wallDurationMs":900000}'::jsonb
),
(
  'PRV_V1', 1, 'PRV_RECOVERY_PLAN',
  'Phục hồi dự án',
  'Phát hiện dự án đang trôi tiến độ hoặc bị chặn, giải thích nguyên nhân và đưa ra kế hoạch phục hồi có kiểm soát.',
  'Chẩn đoán dựa trên tín hiệu xác định được và đề xuất kế hoạch phục hồi, phân biệt rõ SỰ KIỆN / SUY LUẬN / KHUYẾN NGHỊ.',
  'PROJECT_INTELLIGENCE', 'ACTIVE', 'PLAN', 'RECOVERY_PLAN_ACCEPTED', 240000,
  '{"required":["project_id"],"properties":{"project_id":{"type":"uuid","entityType":"PROJECT"},"focus_scope":{"type":"text"},"recovery_horizon":{"type":"text"},"risk_tolerance":{"type":"text"}}}'::jsonb,
  '{"allowedEntityTypes":["PROJECT","TASK","MEETING","PERSON"],"optionalEntityTypes":["DOCUMENT"],"maxSources":20}'::jsonb,
  '{"requiredRole":null,"requiredSkills":["SUMMARIZE_WORK"]}'::jsonb,
  '{"allowedActions":["CREATE_TASK","UPDATE_TASK_FIELDS"],"maxAutonomy":"PROPOSE_ONLY"}'::jsonb,
  '{"type":"PLAN","requiredSections":["Tình hình hiện tại","Bằng chứng","Giả thuyết nguyên nhân gốc","Vấn đề đã xác nhận","Phụ thuộc","Ưu tiên phục hồi","Kế hoạch phục hồi","Hành động đề xuất","Rủi ro của kế hoạch","Quyết định cần con người"]}'::jsonb,
  '{"mandatoryCriteria":["Mỗi vấn đề có bằng chứng thật","Nguyên nhân gốc gắn nhãn SỰ KIỆN hoặc SUY LUẬN","Không bịa phụ thuộc","Kế hoạch gắn với công việc có thật","Không kết luận dự án thất bại khi thiếu tín hiệu","Đề xuất hành động không vượt phạm vi nhân sự AI"]}'::jsonb,
  '{"minimumQualityScore":80,"requiredDimensions":["GROUNDING","COMPLETENESS","ACTIONABILITY","SAFETY"]}'::jsonb,
  '{"policy":"HUMAN_REVIEW_REQUIRED"}'::jsonb,
  '{"machineDurationMs":240000,"wallDurationMs":1200000}'::jsonb
)
ON CONFLICT (code, version) DO NOTHING;

-- 4) Engine cohort — nguồn sự thật phía server, idempotent, version-aware
CREATE OR REPLACE FUNCTION public.compute_work_product_cohort(
  _code text,
  _version integer DEFAULT NULL,
  _from timestamptz DEFAULT (now() - interval '90 days'),
  _to timestamptz DEFAULT now(),
  _tenant_id uuid DEFAULT NULL,
  _include_synthetic boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_platform_admin boolean := public.has_role(auth.uid(), 'admin');
  v_result jsonb;
  v_threshold integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  -- Cách ly tenant: chỉ platform admin mới được tổng hợp xuyên tổ chức.
  IF _tenant_id IS NULL THEN
    IF NOT v_is_platform_admin THEN
      RAISE EXCEPTION 'TENANT_SCOPE_REQUIRED';
    END IF;
  ELSIF NOT (public.is_tenant_member(_tenant_id) OR v_is_platform_admin) THEN
    RAISE EXCEPTION 'TENANT_ACCESS_DENIED';
  END IF;

  SELECT COALESCE((quality_contract->>'minimumQualityScore')::int, 75)
    INTO v_threshold
  FROM public.work_units
  WHERE code = _code AND (_version IS NULL OR version = _version)
  ORDER BY version DESC LIMIT 1;

  WITH eligible AS (
    SELECT e.*, m.machine_duration_ms, m.wall_duration_ms, m.sla_met,
           m.human_confirmations, m.human_review_events, m.outcome_verified,
           m.outcome_accepted, m.completeness AS metrics_completeness,
           m.generator_model,
           c.known_cost, c.completeness AS cost_completeness, c.currency
    FROM public.ai_task_executions e
    LEFT JOIN public.work_execution_metrics m ON m.execution_id = e.id
    LEFT JOIN public.work_execution_costs c ON c.execution_id = e.id
    WHERE e.work_unit_code = _code
      AND (_version IS NULL OR e.work_unit_version = _version)
      AND e.contract_hash IS NOT NULL
      AND e.created_at >= _from AND e.created_at <= _to
      AND (_tenant_id IS NULL OR e.tenant_id = _tenant_id)
      AND (_include_synthetic OR e.cohort_class = 'REAL')
      AND e.cohort_exclusion_reason IS NULL
      AND e.status IN ('ACCEPTED','WAITING_REVIEW','CHANGES_REQUESTED','FAILED')
  ), agg AS (
    SELECT
      count(*)::int AS total_executions,
      count(*) FILTER (WHERE status <> 'FAILED')::int AS completed_executions,
      count(*) FILTER (WHERE status = 'ACCEPTED')::int AS accepted_executions,
      count(*) FILTER (WHERE status = 'FAILED')::int AS failed_executions,
      count(*) FILTER (WHERE status = 'ACCEPTED' AND COALESCE(revision,0) = 0)::int AS first_pass_accepted,
      count(*) FILTER (WHERE COALESCE(revision,0) > 0)::int AS executions_with_revision,
      avg(revision) FILTER (WHERE status <> 'FAILED') AS avg_revisions,
      avg(quality_score) FILTER (WHERE quality_score IS NOT NULL) AS avg_quality,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY quality_score)
        FILTER (WHERE quality_score IS NOT NULL) AS median_quality,
      count(*) FILTER (WHERE quality_score >= 90)::int AS q90,
      count(*) FILTER (WHERE quality_score >= 80 AND quality_score < 90)::int AS q80,
      count(*) FILTER (WHERE quality_score >= 70 AND quality_score < 80)::int AS q70,
      count(*) FILTER (WHERE quality_score IS NOT NULL AND quality_score < v_threshold)::int AS q_below,
      count(*) FILTER (WHERE quality_score IS NULL)::int AS q_missing,
      avg(COALESCE(human_confirmations,0) + COALESCE(human_review_events,0)) AS avg_human_interventions,
      avg(machine_duration_ms) AS avg_machine_ms,
      avg(wall_duration_ms) AS avg_wall_ms,
      count(*) FILTER (WHERE sla_met IS TRUE)::int AS sla_pass,
      count(*) FILTER (WHERE sla_met IS NOT NULL)::int AS sla_known,
      count(*) FILTER (WHERE outcome_verified IS TRUE)::int AS outcome_verified_count,
      count(*) FILTER (WHERE outcome_verified IS NOT NULL)::int AS outcome_known,
      sum(known_cost) FILTER (WHERE known_cost IS NOT NULL) AS known_cost_sum,
      count(*) FILTER (WHERE known_cost IS NOT NULL)::int AS cost_known,
      count(*) FILTER (WHERE cost_completeness = 'FULL')::int AS cost_full,
      count(DISTINCT currency) FILTER (WHERE currency IS NOT NULL)::int AS currency_count,
      min(currency) AS currency,
      count(DISTINCT tenant_id)::int AS tenant_count,
      sum(known_cost) FILTER (WHERE status = 'ACCEPTED' AND known_cost IS NOT NULL) AS accepted_cost_sum,
      count(*) FILTER (WHERE status = 'ACCEPTED' AND known_cost IS NOT NULL)::int AS accepted_cost_known,
      count(*) FILTER (WHERE metrics_completeness IS NULL)::int AS telemetry_missing
    FROM eligible
  ), failures AS (
    SELECT jsonb_object_agg(k, n) AS taxonomy FROM (
      SELECT COALESCE(error_code, 'OTHER_KNOWN') AS k, count(*)::int AS n
      FROM eligible WHERE status = 'FAILED' GROUP BY 1
    ) x
  ), excluded AS (
    SELECT jsonb_object_agg(k, n) AS reasons FROM (
      SELECT COALESCE(cohort_exclusion_reason,
               CASE WHEN cohort_class <> 'REAL' THEN 'NON_REAL_' || cohort_class
                    WHEN contract_hash IS NULL THEN 'NOT_CONTRACT_BOUND' END) AS k,
             count(*)::int AS n
      FROM public.ai_task_executions
      WHERE work_unit_code = _code
        AND (_version IS NULL OR work_unit_version = _version)
        AND created_at >= _from AND created_at <= _to
        AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
        AND (cohort_exclusion_reason IS NOT NULL OR contract_hash IS NULL
             OR (NOT _include_synthetic AND cohort_class <> 'REAL'))
      GROUP BY 1
    ) y WHERE k IS NOT NULL
  )
  SELECT jsonb_build_object(
    'code', _code,
    'version', _version,
    'windowFrom', _from,
    'windowTo', _to,
    'tenantScope', CASE WHEN _tenant_id IS NULL THEN 'PLATFORM' ELSE 'TENANT' END,
    'includeSynthetic', _include_synthetic,
    'qualityThreshold', COALESCE(v_threshold, 75),
    'tenantCount', CASE WHEN _tenant_id IS NULL THEN a.tenant_count ELSE 1 END,
    'totalExecutions', a.total_executions,
    'completedExecutions', a.completed_executions,
    'acceptedExecutions', a.accepted_executions,
    'failedExecutions', a.failed_executions,
    'firstPassAccepted', a.first_pass_accepted,
    'firstPassAcceptanceRate', CASE WHEN a.completed_executions > 0
      THEN round((a.first_pass_accepted::numeric / a.completed_executions) * 100, 1) END,
    'finalAcceptanceRate', CASE WHEN a.completed_executions > 0
      THEN round((a.accepted_executions::numeric / a.completed_executions) * 100, 1) END,
    'averageQualityScore', round(a.avg_quality, 1),
    'medianQualityScore', round(a.median_quality, 1),
    'qualityBands', jsonb_build_object('b90_100', a.q90, 'b80_89', a.q80, 'b70_79', a.q70,
                                       'belowThreshold', a.q_below, 'missing', a.q_missing),
    'averageRevisions', round(a.avg_revisions, 2),
    'executionsWithRevision', a.executions_with_revision,
    'revisionRate', CASE WHEN a.completed_executions > 0
      THEN round((a.executions_with_revision::numeric / a.completed_executions) * 100, 1) END,
    'averageHumanInterventions', round(a.avg_human_interventions, 2),
    'averageMachineDurationMs', round(a.avg_machine_ms),
    'averageWallDurationMs', round(a.avg_wall_ms),
    'slaPassRate', CASE WHEN a.sla_known > 0
      THEN round((a.sla_pass::numeric / a.sla_known) * 100, 1) END,
    'slaKnownCount', a.sla_known,
    'verifiedOutcomeRate', CASE WHEN a.outcome_known > 0
      THEN round((a.outcome_verified_count::numeric / a.outcome_known) * 100, 1) END,
    'verifiedOutcomeKnownCount', a.outcome_known,
    'currency', CASE WHEN a.currency_count = 1 THEN a.currency END,
    'currencyMismatch', a.currency_count > 1,
    'knownCostPerExecution', CASE WHEN a.cost_known > 0 AND a.currency_count <= 1
      THEN round(a.known_cost_sum / a.cost_known, 6) END,
    'knownCostPerAcceptedWork', CASE WHEN a.accepted_cost_known > 0 AND a.currency_count <= 1
      THEN round(a.accepted_cost_sum / a.accepted_cost_known, 6) END,
    'costKnownCount', a.cost_known,
    'costFullCount', a.cost_full,
    'economicsCompleteness', CASE
      WHEN a.total_executions = 0 THEN 'INSUFFICIENT'
      WHEN a.cost_full = a.total_executions THEN 'FULL'
      WHEN a.cost_known > 0 THEN 'PARTIAL'
      ELSE 'INSUFFICIENT' END,
    'dataCompleteness', CASE
      WHEN a.total_executions = 0 THEN 'INSUFFICIENT'
      WHEN a.telemetry_missing = 0 AND a.q_missing = 0 AND a.cost_full = a.total_executions
           AND a.outcome_known = a.total_executions THEN 'FULL'
      WHEN a.telemetry_missing < a.total_executions THEN 'PARTIAL'
      ELSE 'INSUFFICIENT' END,
    'missingSignals', (
      SELECT COALESCE(jsonb_agg(s), '[]'::jsonb) FROM (
        SELECT 'TELEMETRY_MISSING' AS s WHERE a.telemetry_missing > 0
        UNION ALL SELECT 'QUALITY_MISSING' WHERE a.q_missing > 0
        UNION ALL SELECT 'ECONOMICS_MISSING' WHERE a.cost_known < a.total_executions
        UNION ALL SELECT 'OUTCOME_MISSING' WHERE a.outcome_known < a.total_executions
      ) z),
    'cohortStatus', CASE
      WHEN a.completed_executions >= 50 THEN 'PROVEN'
      WHEN a.completed_executions >= 20 THEN 'PROVISIONAL'
      WHEN a.completed_executions >= 5 THEN 'EARLY'
      ELSE 'INSUFFICIENT' END,
    'failureTaxonomy', COALESCE(f.taxonomy, '{}'::jsonb),
    'exclusions', COALESCE(x.reasons, '{}'::jsonb),
    'computedAt', now()
  ) INTO v_result
  FROM agg a CROSS JOIN failures f CROSS JOIN excluded x;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.compute_work_product_cohort(text, integer, timestamptz, timestamptz, uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.compute_work_product_cohort(text, integer, timestamptz, timestamptz, uuid, boolean) TO authenticated, service_role;