-- WE-1 — Work Economics & Sell Work Metering

CREATE TABLE IF NOT EXISTS public.work_units (
  code text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1,
  template_code text UNIQUE,
  label text NOT NULL,
  objective text NOT NULL,
  deliverable_type text NOT NULL,
  expected_outcome_type text NOT NULL,
  sla_machine_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.work_units TO authenticated;
GRANT ALL ON public.work_units TO service_role;
ALTER TABLE public.work_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS work_units_read ON public.work_units;
CREATE POLICY work_units_read ON public.work_units FOR SELECT TO authenticated USING (true);

INSERT INTO public.work_units (code, version, template_code, label, objective, deliverable_type, expected_outcome_type, sla_machine_ms) VALUES
 ('WEEKLY_PROJECT_INTELLIGENCE', 1, 'SUMMARY_REPORT', 'Báo cáo tóm tắt dự án', 'Tổng hợp diễn biến và việc cần làm tiếp theo', 'SUMMARY', 'REPORT_ACCEPTED', 180000),
 ('PROJECT_RISK_ANALYSIS', 1, 'ANALYSIS_REPORT', 'Phân tích rủi ro dự án', 'Nhận diện rủi ro và khuyến nghị xử lý', 'ANALYSIS', 'PROJECT_RISK_IDENTIFIED', 240000),
 ('MEETING_TO_EXECUTION', 1, 'MEETING_FOLLOW_UP', 'Chuyển cuộc họp thành việc', 'Biến quyết định cuộc họp thành việc cần làm', 'PLAN', 'FOLLOW_UP_PREPARED', 180000),
 ('RESEARCH_BRIEF', 1, 'RESEARCH_BRIEF', 'Bản tổng hợp nghiên cứu', 'Tổng hợp phát hiện và khoảng trống dữ liệu', 'DRAFT', 'REPORT_ACCEPTED', 240000)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.work_execution_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  workspace_id uuid,
  execution_id uuid NOT NULL UNIQUE REFERENCES public.ai_task_executions(id) ON DELETE CASCADE,
  task_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  ai_worker_id uuid,
  work_unit_code text NOT NULL DEFAULT 'UNRESOLVED',
  work_unit_version integer NOT NULL DEFAULT 0,
  work_unit_resolved boolean NOT NULL DEFAULT false,
  execution_status text,
  machine_started_at timestamptz,
  machine_completed_at timestamptz,
  machine_duration_ms integer,
  wall_started_at timestamptz,
  wall_completed_at timestamptz,
  wall_duration_ms integer,
  queue_wait_ms integer,
  sla_machine_ms integer,
  sla_met boolean,
  model_calls integer NOT NULL DEFAULT 0,
  generator_model text,
  evaluator_model text,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  token_source text NOT NULL DEFAULT 'MISSING',
  context_source_count integer,
  context_partial boolean,
  step_total integer NOT NULL DEFAULT 0,
  step_failed integer NOT NULL DEFAULT 0,
  step_awaiting_confirmation integer NOT NULL DEFAULT 0,
  proposals_total integer NOT NULL DEFAULT 0,
  proposals_executed integer NOT NULL DEFAULT 0,
  proposals_rejected integer NOT NULL DEFAULT 0,
  human_confirmations integer NOT NULL DEFAULT 0,
  human_review_events integer NOT NULL DEFAULT 0,
  revision_count integer NOT NULL DEFAULT 1,
  quality_status text,
  quality_score integer,
  quality_passed boolean,
  outcome_type text,
  outcome_verified boolean,
  outcome_accepted boolean,
  completeness text NOT NULL DEFAULT 'PARTIAL',
  missing_signals text[] NOT NULL DEFAULT '{}',
  metrics_version text NOT NULL DEFAULT 'we1.metrics.v1',
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_execution_metrics_tenant_idx ON public.work_execution_metrics (tenant_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS work_execution_metrics_unit_idx ON public.work_execution_metrics (tenant_id, work_unit_code);
CREATE INDEX IF NOT EXISTS work_execution_metrics_task_idx ON public.work_execution_metrics (task_id);

GRANT SELECT ON public.work_execution_metrics TO authenticated;
GRANT ALL ON public.work_execution_metrics TO service_role;
ALTER TABLE public.work_execution_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS work_execution_metrics_read ON public.work_execution_metrics;
CREATE POLICY work_execution_metrics_read ON public.work_execution_metrics
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

-- Không có policy INSERT/UPDATE: chỉ RPC SECURITY DEFINER dưới đây được ghi.

CREATE OR REPLACE FUNCTION public.recompute_work_execution_metrics(_execution_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.ai_task_executions%ROWTYPE;
  wu public.work_units%ROWTYPE;
  v_missing text[] := '{}';
  v_machine_ms integer;
  v_wall_completed timestamptz;
  v_wall_ms integer;
  v_queue_ms integer;
  v_in integer;
  v_out integer;
  v_token_source text := 'MISSING';
  v_eval_calls integer := 0;
  v_model_calls integer := 0;
  v_evaluator_model text;
  v_steps record;
  v_props record;
  v_reviews integer := 0;
  v_revisions integer := 1;
  v_sla_met boolean;
  v_completeness text;
  v_row public.work_execution_metrics%ROWTYPE;
BEGIN
  SELECT * INTO e FROM public.ai_task_executions WHERE id = _execution_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXECUTION_NOT_FOUND';
  END IF;
  IF NOT public.is_tenant_member(e.tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO wu FROM public.work_units WHERE template_code = e.template_code;

  -- Thời gian máy: ưu tiên mốc thật trên bản ghi, không ước lượng.
  IF e.started_at IS NOT NULL AND e.completed_at IS NOT NULL THEN
    v_machine_ms := GREATEST(0, (EXTRACT(EPOCH FROM (e.completed_at - e.started_at)) * 1000)::integer);
  ELSE
    v_missing := v_missing || 'MACHINE_DURATION';
  END IF;

  v_wall_completed := COALESCE(e.reviewed_at, e.completed_at);
  IF v_wall_completed IS NOT NULL THEN
    v_wall_ms := GREATEST(0, (EXTRACT(EPOCH FROM (v_wall_completed - e.created_at)) * 1000)::integer);
  ELSE
    v_missing := v_missing || 'WALL_DURATION';
  END IF;

  IF e.started_at IS NOT NULL THEN
    v_queue_ms := GREATEST(0, (EXTRACT(EPOCH FROM (e.started_at - e.created_at)) * 1000)::integer);
  END IF;

  v_in := NULLIF(e.evidence->>'inputTokens','')::integer;
  v_out := NULLIF(e.evidence->>'outputTokens','')::integer;
  v_eval_calls := COALESCE(NULLIF(e.quality_assessment->'evaluator'->>'modelCalls','')::integer, 0);
  v_evaluator_model := e.quality_assessment->'evaluator'->>'evaluatorModel';

  IF v_eval_calls > 0 THEN
    v_in := COALESCE(v_in,0) + COALESCE(NULLIF(e.quality_assessment->'evaluator'->>'inputTokens','')::integer, 0);
    v_out := COALESCE(v_out,0) + COALESCE(NULLIF(e.quality_assessment->'evaluator'->>'outputTokens','')::integer, 0);
  END IF;

  v_model_calls := (CASE WHEN e.evidence->>'model' IS NOT NULL THEN 1 ELSE 0 END) + v_eval_calls;

  IF v_in IS NULL AND v_out IS NULL THEN
    v_token_source := 'MISSING';
    v_missing := v_missing || 'TOKENS';
  ELSIF e.evidence->>'model' IS NULL OR v_eval_calls = 0 THEN
    v_token_source := 'PARTIAL';
  ELSE
    v_token_source := 'REAL';
  END IF;

  SELECT
    COUNT(*)::integer AS total,
    COUNT(*) FILTER (WHERE status = 'FAILED')::integer AS failed,
    COUNT(*) FILTER (WHERE status = 'AWAITING_CONFIRMATION')::integer AS awaiting
  INTO v_steps
  FROM public.work_execution_steps WHERE execution_id = _execution_id;

  SELECT
    COUNT(*)::integer AS total,
    COUNT(*) FILTER (WHERE status = 'SUCCEEDED')::integer AS executed,
    COUNT(*) FILTER (WHERE status IN ('CANCELLED','EXPIRED','FAILED'))::integer AS rejected,
    COUNT(*) FILTER (WHERE confirmed_at IS NOT NULL)::integer AS confirmed
  INTO v_props
  FROM public.ai_action_proposals WHERE execution_id = _execution_id;

  v_reviews := (CASE WHEN e.reviewed_at IS NOT NULL THEN 1 ELSE 0 END);
  SELECT COUNT(*)::integer INTO v_revisions FROM public.ai_task_executions WHERE task_id = e.task_id;

  IF wu.code IS NULL THEN
    v_missing := v_missing || 'WORK_UNIT';
  ELSIF wu.sla_machine_ms IS NOT NULL AND v_machine_ms IS NOT NULL THEN
    v_sla_met := v_machine_ms <= wu.sla_machine_ms;
  END IF;

  IF e.quality_status IS NULL THEN
    v_missing := v_missing || 'QUALITY';
  END IF;

  v_completeness := CASE WHEN array_length(v_missing, 1) IS NULL THEN 'COMPLETE' ELSE 'PARTIAL' END;

  INSERT INTO public.work_execution_metrics AS m (
    tenant_id, workspace_id, execution_id, task_id, revision, ai_worker_id,
    work_unit_code, work_unit_version, work_unit_resolved, execution_status,
    machine_started_at, machine_completed_at, machine_duration_ms,
    wall_started_at, wall_completed_at, wall_duration_ms, queue_wait_ms,
    sla_machine_ms, sla_met,
    model_calls, generator_model, evaluator_model,
    input_tokens, output_tokens, total_tokens, token_source,
    context_source_count, context_partial,
    step_total, step_failed, step_awaiting_confirmation,
    proposals_total, proposals_executed, proposals_rejected,
    human_confirmations, human_review_events, revision_count,
    quality_status, quality_score, quality_passed,
    outcome_type, outcome_verified, outcome_accepted,
    completeness, missing_signals, computed_at, updated_at
  ) VALUES (
    e.tenant_id, e.workspace_id, e.id, e.task_id, e.revision, e.ai_worker_id,
    COALESCE(wu.code, 'UNRESOLVED'), COALESCE(wu.version, 0), wu.code IS NOT NULL, e.status,
    e.started_at, e.completed_at, v_machine_ms,
    e.created_at, v_wall_completed, v_wall_ms, v_queue_ms,
    wu.sla_machine_ms, v_sla_met,
    v_model_calls, e.evidence->>'model', v_evaluator_model,
    v_in, v_out, COALESCE(v_in,0) + COALESCE(v_out,0), v_token_source,
    NULLIF(e.evidence->>'sourceCount','')::integer, (e.evidence->>'partialContext')::boolean,
    COALESCE(v_steps.total,0), COALESCE(v_steps.failed,0), COALESCE(v_steps.awaiting,0),
    COALESCE(v_props.total,0), COALESCE(v_props.executed,0), COALESCE(v_props.rejected,0),
    COALESCE(v_props.confirmed,0), v_reviews, GREATEST(v_revisions, e.revision),
    e.quality_status, e.quality_score, e.quality_passed,
    e.outcome->>'type', (e.outcome->>'verified')::boolean, e.status = 'ACCEPTED',
    v_completeness, v_missing, now(), now()
  )
  ON CONFLICT (execution_id) DO UPDATE SET
    workspace_id = EXCLUDED.workspace_id,
    revision = EXCLUDED.revision,
    ai_worker_id = EXCLUDED.ai_worker_id,
    work_unit_code = EXCLUDED.work_unit_code,
    work_unit_version = EXCLUDED.work_unit_version,
    work_unit_resolved = EXCLUDED.work_unit_resolved,
    execution_status = EXCLUDED.execution_status,
    machine_started_at = EXCLUDED.machine_started_at,
    machine_completed_at = EXCLUDED.machine_completed_at,
    machine_duration_ms = EXCLUDED.machine_duration_ms,
    wall_started_at = EXCLUDED.wall_started_at,
    wall_completed_at = EXCLUDED.wall_completed_at,
    wall_duration_ms = EXCLUDED.wall_duration_ms,
    queue_wait_ms = EXCLUDED.queue_wait_ms,
    sla_machine_ms = EXCLUDED.sla_machine_ms,
    sla_met = EXCLUDED.sla_met,
    model_calls = EXCLUDED.model_calls,
    generator_model = EXCLUDED.generator_model,
    evaluator_model = EXCLUDED.evaluator_model,
    input_tokens = EXCLUDED.input_tokens,
    output_tokens = EXCLUDED.output_tokens,
    total_tokens = EXCLUDED.total_tokens,
    token_source = EXCLUDED.token_source,
    context_source_count = EXCLUDED.context_source_count,
    context_partial = EXCLUDED.context_partial,
    step_total = EXCLUDED.step_total,
    step_failed = EXCLUDED.step_failed,
    step_awaiting_confirmation = EXCLUDED.step_awaiting_confirmation,
    proposals_total = EXCLUDED.proposals_total,
    proposals_executed = EXCLUDED.proposals_executed,
    proposals_rejected = EXCLUDED.proposals_rejected,
    human_confirmations = EXCLUDED.human_confirmations,
    human_review_events = EXCLUDED.human_review_events,
    revision_count = EXCLUDED.revision_count,
    quality_status = EXCLUDED.quality_status,
    quality_score = EXCLUDED.quality_score,
    quality_passed = EXCLUDED.quality_passed,
    outcome_type = EXCLUDED.outcome_type,
    outcome_verified = EXCLUDED.outcome_verified,
    outcome_accepted = EXCLUDED.outcome_accepted,
    completeness = EXCLUDED.completeness,
    missing_signals = EXCLUDED.missing_signals,
    computed_at = now(),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_work_execution_metrics(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.recompute_work_execution_metrics(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.work_economics_summary(
  _tenant_id uuid,
  _workspace_id uuid DEFAULT NULL,
  _from timestamptz DEFAULT (now() - interval '30 days'),
  _to timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.is_tenant_member(_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT jsonb_build_object(
    'metricsVersion', 'we1.metrics.v1',
    'from', _from,
    'to', _to,
    'runs', COUNT(*),
    'completeRuns', COUNT(*) FILTER (WHERE completeness = 'COMPLETE'),
    'acceptedRuns', COUNT(*) FILTER (WHERE outcome_accepted),
    'verifiedOutcomes', COUNT(*) FILTER (WHERE outcome_verified),
    'qualityPassedRuns', COUNT(*) FILTER (WHERE quality_passed),
    'humanInterventions', COALESCE(SUM(human_confirmations + human_review_events), 0),
    'modelCalls', COALESCE(SUM(model_calls), 0),
    'totalTokens', COALESCE(SUM(total_tokens), 0),
    'tokenSourceReal', COUNT(*) FILTER (WHERE token_source = 'REAL'),
    'machineMsP50', percentile_disc(0.5) WITHIN GROUP (ORDER BY machine_duration_ms),
    'machineMsP95', percentile_disc(0.95) WITHIN GROUP (ORDER BY machine_duration_ms),
    'wallMsP50', percentile_disc(0.5) WITHIN GROUP (ORDER BY wall_duration_ms),
    'slaMetRuns', COUNT(*) FILTER (WHERE sla_met),
    'slaEvaluatedRuns', COUNT(*) FILTER (WHERE sla_met IS NOT NULL)
  )
  INTO v
  FROM public.work_execution_metrics
  WHERE tenant_id = _tenant_id
    AND (_workspace_id IS NULL OR workspace_id = _workspace_id)
    AND computed_at >= _from AND computed_at <= _to;

  RETURN COALESCE(v, jsonb_build_object('runs', 0));
END;
$$;

REVOKE ALL ON FUNCTION public.work_economics_summary(uuid, uuid, timestamptz, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.work_economics_summary(uuid, uuid, timestamptz, timestamptz) TO authenticated, service_role;