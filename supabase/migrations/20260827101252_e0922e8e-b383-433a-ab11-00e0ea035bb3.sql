ALTER TABLE public.ai_task_executions
  ADD COLUMN IF NOT EXISTS quality_status text NOT NULL DEFAULT 'NOT_EVALUATED',
  ADD COLUMN IF NOT EXISTS quality_score integer,
  ADD COLUMN IF NOT EXISTS quality_passed boolean,
  ADD COLUMN IF NOT EXISTS quality_assessment jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS evidence_pack jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS accepted_with_warnings boolean NOT NULL DEFAULT false;

ALTER TABLE public.ai_task_executions
  DROP CONSTRAINT IF EXISTS ai_task_executions_quality_status_check;
ALTER TABLE public.ai_task_executions
  ADD CONSTRAINT ai_task_executions_quality_status_check
  CHECK (quality_status IN ('NOT_EVALUATED','EVALUATING','PASSED','PASSED_WITH_WARNINGS','FAILED_QUALITY','EVALUATION_ERROR'));

-- Server-authoritative: tính lại điểm từ dimensions, bỏ qua mọi điểm client/model gửi lên.
CREATE OR REPLACE FUNCTION public.compute_work_quality_score(_assessment jsonb)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  d jsonb := coalesce(_assessment->'dimensions', '{}'::jsonb);
  has_action boolean := (d ? 'actionVerification');
  w jsonb;
  k text;
  total numeric := 0;
  used numeric := 0;
  s numeric;
BEGIN
  IF has_action THEN
    w := '{"acceptanceCriteria":0.30,"evidenceGrounding":0.25,"completeness":0.15,"consistency":0.15,"actionVerification":0.15}'::jsonb;
  ELSE
    w := '{"acceptanceCriteria":0.35,"evidenceGrounding":0.30,"completeness":0.20,"consistency":0.15}'::jsonb;
  END IF;

  FOR k IN SELECT jsonb_object_keys(w) LOOP
    IF d ? k THEN
      s := coalesce((d->k->>'score')::numeric, 0);
      s := greatest(0, least(100, s));
      total := total + s * (w->>k)::numeric;
      used := used + (w->>k)::numeric;
    END IF;
  END LOOP;

  IF used = 0 THEN RETURN 0; END IF;
  RETURN round(total / used)::integer;
END;
$$;

-- Ghi kết quả chấm chất lượng + evidence pack + outcome cho MỘT revision.
CREATE OR REPLACE FUNCTION public.persist_work_quality(
  _execution_id uuid,
  _assessment jsonb,
  _evidence_pack jsonb,
  _outcome jsonb
)
RETURNS public.ai_task_executions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ex public.ai_task_executions;
  computed_score integer;
  blockers integer;
  threshold integer := 75;
  is_error boolean;
  computed_passed boolean;
  computed_status text;
  warnings integer;
BEGIN
  SELECT * INTO ex FROM public.ai_task_executions WHERE id = _execution_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI_EXECUTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = ex.tenant_id AND tm.user_id = auth.uid() AND tm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  -- Bất biến lịch sử: revision đã đóng review không bao giờ bị ghi đè.
  IF ex.status IN ('ACCEPTED','CHANGES_REQUESTED','FAILED') THEN
    RAISE EXCEPTION 'AI_EVIDENCE_IMMUTABLE' USING ERRCODE = '42501';
  END IF;

  is_error := coalesce(_assessment->>'status', '') = 'EVALUATION_ERROR';
  blockers := coalesce(jsonb_array_length(_assessment->'blockers'), 0);
  warnings := coalesce(jsonb_array_length(_assessment->'warnings'), 0);
  computed_score := CASE WHEN is_error THEN 0 ELSE public.compute_work_quality_score(_assessment) END;
  computed_passed := (NOT is_error) AND blockers = 0 AND computed_score >= threshold;

  IF is_error THEN
    computed_status := 'EVALUATION_ERROR';
  ELSIF NOT computed_passed THEN
    computed_status := 'FAILED_QUALITY';
  ELSIF warnings > 0 THEN
    computed_status := 'PASSED_WITH_WARNINGS';
  ELSE
    computed_status := 'PASSED';
  END IF;

  UPDATE public.ai_task_executions SET
    quality_status = computed_status,
    quality_score = computed_score,
    quality_passed = computed_passed,
    -- điểm/passed trong payload bị GHI ĐÈ bằng giá trị server tính
    quality_assessment = jsonb_set(
      jsonb_set(
        jsonb_set(coalesce(_assessment, '{}'::jsonb), '{score}', to_jsonb(computed_score), true),
        '{passed}', to_jsonb(computed_passed), true),
      '{status}', to_jsonb(computed_status), true),
    evidence_pack = coalesce(_evidence_pack, '{}'::jsonb),
    outcome = coalesce(_outcome, ex.outcome),
    updated_at = now()
  WHERE id = _execution_id
  RETURNING * INTO ex;

  INSERT INTO public.audit_events (tenant_id, actor_id, actor_user_id, event_type, action, aggregate_type, aggregate_id, resource_type, resource_id, payload, source)
  VALUES (ex.tenant_id, auth.uid(), auth.uid(), 'work_quality.evaluation_completed', 'work_quality.evaluation_completed',
          'task', ex.task_id, 'ai_task_execution', ex.id,
          jsonb_build_object('execution_id', ex.id, 'revision', ex.revision, 'score', computed_score,
                             'status', computed_status, 'blockers', blockers), 'app');

  IF blockers > 0 THEN
    INSERT INTO public.audit_events (tenant_id, actor_id, actor_user_id, event_type, action, aggregate_type, aggregate_id, resource_type, resource_id, payload, source)
    VALUES (ex.tenant_id, auth.uid(), auth.uid(), 'work_quality.hard_gate_failed', 'work_quality.hard_gate_failed',
            'task', ex.task_id, 'ai_task_execution', ex.id,
            jsonb_build_object('execution_id', ex.id, 'blockers', _assessment->'blockers'), 'app');
  END IF;

  RETURN ex;
END;
$$;

-- Sau khi CON NGƯỜI nghiệm thu: chốt outcome, ghi nhận nghiệm thu kèm cảnh báo nếu chất lượng chưa đạt.
CREATE OR REPLACE FUNCTION public.finalize_work_outcome(_execution_id uuid)
RETURNS public.ai_task_executions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ex public.ai_task_executions;
  warn boolean;
BEGIN
  SELECT * INTO ex FROM public.ai_task_executions WHERE id = _execution_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI_EXECUTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = ex.tenant_id AND tm.user_id = auth.uid() AND tm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF ex.status <> 'ACCEPTED' THEN
    RAISE EXCEPTION 'AI_EXECUTION_NOT_ACCEPTED' USING ERRCODE = '22023';
  END IF;

  warn := coalesce(ex.quality_passed, false) = false;

  UPDATE public.ai_task_executions SET
    accepted_with_warnings = warn,
    outcome = coalesce(ex.outcome, '{}'::jsonb)
      || jsonb_build_object(
           'status', 'ACCEPTED',
           'acceptedBy', auth.uid(),
           'acceptedAt', now(),
           'acceptedWithWarnings', warn),
    updated_at = now()
  WHERE id = _execution_id
  RETURNING * INTO ex;

  INSERT INTO public.audit_events (tenant_id, actor_id, actor_user_id, event_type, action, aggregate_type, aggregate_id, resource_type, resource_id, payload, source)
  VALUES (ex.tenant_id, auth.uid(), auth.uid(), 'work_outcome.accepted', 'work_outcome.accepted',
          'task', ex.task_id, 'ai_task_execution', ex.id,
          jsonb_build_object('execution_id', ex.id, 'revision', ex.revision,
                             'quality_score', ex.quality_score,
                             'accepted_with_warnings', warn,
                             'outcome_type', ex.outcome->>'type'), 'app');

  RETURN ex;
END;
$$;

REVOKE ALL ON FUNCTION public.persist_work_quality(uuid, jsonb, jsonb, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.finalize_work_outcome(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.compute_work_quality_score(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.persist_work_quality(uuid, jsonb, jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_work_outcome(uuid) TO authenticated, service_role;