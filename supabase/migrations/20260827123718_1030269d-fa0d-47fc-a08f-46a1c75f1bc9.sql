-- WE-2: ngưỡng chất lượng do hợp đồng sản phẩm công việc quy định, nhưng KHÔNG
-- bao giờ thấp hơn sàn hệ thống (75). Đọc từ bản chụp hợp đồng đã gắn vào lượt chạy.
CREATE OR REPLACE FUNCTION public.persist_work_quality(_execution_id uuid, _assessment jsonb, _evidence_pack jsonb, _outcome jsonb)
 RETURNS ai_task_executions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ex public.ai_task_executions;
  computed_score integer;
  blockers integer;
  threshold integer := 75;
  contract_threshold integer;
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

  IF ex.status IN ('ACCEPTED','CHANGES_REQUESTED','FAILED') THEN
    RAISE EXCEPTION 'AI_EVIDENCE_IMMUTABLE' USING ERRCODE = '42501';
  END IF;

  BEGIN
    contract_threshold := nullif(ex.contract_snapshot #>> '{quality_contract,minimumQualityScore}', '')::integer;
  EXCEPTION WHEN others THEN
    contract_threshold := NULL;
  END;
  IF contract_threshold IS NOT NULL AND contract_threshold > threshold AND contract_threshold <= 100 THEN
    threshold := contract_threshold;
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
    quality_assessment = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(coalesce(_assessment, '{}'::jsonb), '{score}', to_jsonb(computed_score), true),
          '{passed}', to_jsonb(computed_passed), true),
        '{status}', to_jsonb(computed_status), true),
      '{threshold}', to_jsonb(threshold), true),
    evidence_pack = coalesce(_evidence_pack, '{}'::jsonb),
    outcome = coalesce(_outcome, ex.outcome),
    updated_at = now()
  WHERE id = _execution_id
  RETURNING * INTO ex;

  INSERT INTO public.audit_events (tenant_id, actor_id, actor_user_id, event_type, action, aggregate_type, aggregate_id, resource_type, resource_id, payload, source)
  VALUES (ex.tenant_id, auth.uid(), auth.uid(), 'work_quality.evaluation_completed', 'work_quality.evaluation_completed',
          'task', ex.task_id, 'ai_task_execution', ex.id,
          jsonb_build_object('execution_id', ex.id, 'revision', ex.revision, 'score', computed_score,
                             'status', computed_status, 'threshold', threshold, 'blockers', blockers), 'app');

  IF blockers > 0 THEN
    INSERT INTO public.audit_events (tenant_id, actor_id, actor_user_id, event_type, action, aggregate_type, aggregate_id, resource_type, resource_id, payload, source)
    VALUES (ex.tenant_id, auth.uid(), auth.uid(), 'work_quality.hard_gate_failed', 'work_quality.hard_gate_failed',
            'task', ex.task_id, 'ai_task_execution', ex.id,
            jsonb_build_object('execution_id', ex.id, 'blockers', _assessment->'blockers'), 'app');
  END IF;

  RETURN ex;
END;
$function$;