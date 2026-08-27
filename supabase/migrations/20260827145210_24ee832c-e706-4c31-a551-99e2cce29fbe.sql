-- HARDEN-SELLWORK-1

-- 1) Chuẩn hoá định danh model: "openai/gpt-5" -> (openai, gpt-5)
CREATE OR REPLACE FUNCTION public.split_ai_model_identity(_raw text)
RETURNS TABLE(provider text, model text)
LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT
    CASE WHEN _raw IS NULL THEN NULL
         WHEN position('/' in _raw) > 0 THEN split_part(_raw, '/', 1)
         WHEN _raw LIKE 'gpt%' OR _raw LIKE 'o1%' OR _raw LIKE 'o3%' THEN 'openai'
         WHEN _raw LIKE 'gemini%' THEN 'google'
         WHEN _raw LIKE 'claude%' THEN 'anthropic'
         ELSE 'unknown' END,
    CASE WHEN _raw IS NULL THEN NULL
         WHEN position('/' in _raw) > 0 THEN substring(_raw from position('/' in _raw) + 1)
         ELSE _raw END;
$$;

-- 2) Mở rộng telemetry AI hiện hữu để quy chiếu theo lượt chạy + mục đích gọi
ALTER TABLE public.ai_usage_events
  ADD COLUMN IF NOT EXISTS execution_id uuid,
  ADD COLUMN IF NOT EXISTS execution_revision integer,
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS token_precision text NOT NULL DEFAULT 'EXACT';

DO $$ BEGIN
  ALTER TABLE public.ai_usage_events
    ADD CONSTRAINT ai_usage_events_purpose_chk
    CHECK (purpose IN ('GENERATOR','EVALUATOR','PLANNER','OTHER'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS ai_usage_events_execution_idx
  ON public.ai_usage_events (execution_id, created_at);

-- 3) Ghi usage event từ server (tenant guard, không nhận chi phí do client cấp)
CREATE OR REPLACE FUNCTION public.record_ai_usage_event(
  _execution_id uuid, _purpose text, _model text, _input_tokens integer,
  _output_tokens integer, _provider text DEFAULT NULL, _duration_ms integer DEFAULT NULL,
  _token_precision text DEFAULT 'EXACT'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e public.ai_task_executions%ROWTYPE; v_id uuid; v_prov text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501'; END IF;
  SELECT * INTO e FROM public.ai_task_executions WHERE id = _execution_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'EXECUTION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.is_tenant_member(e.tenant_id) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF _purpose NOT IN ('GENERATOR','EVALUATOR','PLANNER','OTHER') THEN
    RAISE EXCEPTION 'USAGE_PURPOSE_NOT_ALLOWED' USING ERRCODE = '22023';
  END IF;

  v_prov := COALESCE(NULLIF(_provider,''), (SELECT s.provider FROM public.split_ai_model_identity(_model) s));

  INSERT INTO public.ai_usage_events (
    tenant_id, workspace_id, user_id, model, provider, purpose,
    execution_id, execution_revision, input_tokens, output_tokens, total_tokens,
    duration_ms, status, token_precision
  ) VALUES (
    e.tenant_id, e.workspace_id, auth.uid(), _model, v_prov, _purpose,
    e.id, e.revision, GREATEST(COALESCE(_input_tokens,0),0), GREATEST(COALESCE(_output_tokens,0),0),
    GREATEST(COALESCE(_input_tokens,0),0) + GREATEST(COALESCE(_output_tokens,0),0),
    _duration_ms, 'SUCCEEDED', COALESCE(_token_precision,'EXACT')
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- 4) Cột phục vụ chi phí đúng tiền tệ + mã tín hiệu thiếu ổn định
ALTER TABLE public.work_execution_costs
  ALTER COLUMN known_cost DROP NOT NULL;
ALTER TABLE public.work_execution_costs
  ADD COLUMN IF NOT EXISTS missing_signals text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_currency text,
  ADD COLUMN IF NOT EXISTS human_currency text,
  ADD COLUMN IF NOT EXISTS ai_cost_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 5) Tính lại chi phí: có uỷ quyền, theo từng lượt gọi model, tuyệt đối không cộng lệch tiền tệ
CREATE OR REPLACE FUNCTION public.recompute_work_execution_cost(_execution_id uuid)
RETURNS public.work_execution_costs
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  m public.work_execution_metrics%ROWTYPE;
  h public.human_cost_policies%ROWTYPE;
  r public.ai_model_cost_rates%ROWTYPE;
  u record;
  v_ai numeric := NULL; v_ai_status text := 'UNKNOWN';
  v_human numeric := NULL; v_human_status text := 'UNKNOWN';
  v_unknown text[] := '{}';
  v_signals text[] := '{}';
  v_known numeric := NULL;
  v_complete text := 'PARTIAL';
  v_at timestamptz;
  v_events integer := 0;
  v_rate_missing boolean := false;
  v_currencies text[] := '{}';
  v_ai_currency text; v_currency text;
  v_breakdown jsonb := '[]'::jsonb;
  v_prov text; v_model text;
  v_last_rate public.ai_model_cost_rates%ROWTYPE;
  out_row public.work_execution_costs;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501'; END IF;

  SELECT * INTO m FROM public.work_execution_metrics WHERE execution_id = _execution_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT public.is_tenant_member(m.tenant_id) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;

  v_at := COALESCE(m.machine_started_at, m.wall_started_at, m.computed_at);

  SELECT count(*) INTO v_events FROM public.ai_usage_events WHERE execution_id = _execution_id;

  IF v_events > 0 THEN
    v_ai := 0;
    FOR u IN
      SELECT ue.model, ue.provider, ue.purpose, ue.input_tokens, ue.output_tokens, ue.created_at
        FROM public.ai_usage_events ue WHERE ue.execution_id = _execution_id ORDER BY ue.created_at
    LOOP
      SELECT s.provider, s.model INTO v_prov, v_model FROM public.split_ai_model_identity(u.model) s;
      v_prov := COALESCE(NULLIF(u.provider,''), v_prov);
      IF v_prov IS NULL OR v_prov = 'unknown' THEN v_signals := v_signals || 'USAGE_PROVIDER_UNKNOWN'; END IF;
      IF v_model IS NULL THEN v_signals := v_signals || 'USAGE_MODEL_UNKNOWN'; END IF;

      SELECT * INTO r FROM public.ai_model_cost_rates
       WHERE provider = v_prov AND model = v_model AND status = 'ACTIVE'
         AND effective_from <= u.created_at AND (effective_to IS NULL OR effective_to > u.created_at)
       ORDER BY effective_from DESC, rate_version DESC LIMIT 1;

      IF NOT FOUND THEN
        v_rate_missing := true;
        v_breakdown := v_breakdown || jsonb_build_object(
          'purpose', u.purpose, 'provider', v_prov, 'model', v_model,
          'inputTokens', u.input_tokens, 'outputTokens', u.output_tokens,
          'cost', NULL, 'currency', NULL, 'rateVersion', NULL, 'status', 'MODEL_RATE_MISSING');
      ELSE
        v_last_rate := r;
        IF NOT (r.currency = ANY(v_currencies)) THEN v_currencies := v_currencies || r.currency; END IF;
        v_ai := v_ai + ROUND((u.input_tokens::numeric / 1000000) * r.input_token_rate
                           + (u.output_tokens::numeric / 1000000) * r.output_token_rate, 6);
        v_breakdown := v_breakdown || jsonb_build_object(
          'purpose', u.purpose, 'provider', r.provider, 'model', r.model,
          'inputTokens', u.input_tokens, 'outputTokens', u.output_tokens,
          'cost', ROUND((u.input_tokens::numeric / 1000000) * r.input_token_rate
                      + (u.output_tokens::numeric / 1000000) * r.output_token_rate, 6),
          'currency', r.currency, 'rateVersion', r.rate_version,
          'rateEffectiveAt', r.effective_from, 'status', 'MEASURED');
      END IF;
    END LOOP;

    IF v_rate_missing THEN
      v_ai := NULL; v_ai_status := 'UNKNOWN';
      v_unknown := v_unknown || 'AI_COMPUTE';
      v_signals := v_signals || 'MODEL_RATE_MISSING';
    ELSIF array_length(v_currencies, 1) > 1 THEN
      v_ai := NULL; v_ai_status := 'UNKNOWN';
      v_unknown := v_unknown || 'AI_COMPUTE';
      v_signals := v_signals || 'CURRENCY_MISMATCH';
    ELSE
      v_ai_currency := v_currencies[1];
      v_ai_status := CASE WHEN v_ai = 0 THEN 'ZERO' ELSE 'MEASURED' END;
      r := v_last_rate;
    END IF;
  ELSE
    -- Đường dự phòng khi chưa có usage event: chỉ số gộp của WE-1.
    IF m.token_source = 'MISSING' OR m.total_tokens IS NULL THEN
      v_unknown := v_unknown || 'AI_COMPUTE';
      v_signals := v_signals || 'TOKEN_USAGE_MISSING';
    ELSIF m.total_tokens = 0 THEN
      v_ai := 0; v_ai_status := 'ZERO';
    ELSE
      SELECT s.provider, s.model INTO v_prov, v_model FROM public.split_ai_model_identity(m.generator_model) s;
      SELECT * INTO r FROM public.ai_model_cost_rates
       WHERE provider = v_prov AND model = v_model AND status = 'ACTIVE'
         AND effective_from <= v_at AND (effective_to IS NULL OR effective_to > v_at)
       ORDER BY effective_from DESC, rate_version DESC LIMIT 1;
      IF FOUND THEN
        v_ai := ROUND((COALESCE(m.input_tokens,0)::numeric / 1000000) * r.input_token_rate
                    + (COALESCE(m.output_tokens,0)::numeric / 1000000) * r.output_token_rate, 6);
        v_ai_status := 'MEASURED';
        v_ai_currency := r.currency;
        v_breakdown := jsonb_build_array(jsonb_build_object(
          'purpose', 'AGGREGATE', 'provider', r.provider, 'model', r.model,
          'inputTokens', COALESCE(m.input_tokens,0), 'outputTokens', COALESCE(m.output_tokens,0),
          'cost', v_ai, 'currency', r.currency, 'rateVersion', r.rate_version, 'status', 'MEASURED'));
        IF m.evaluator_model IS NOT NULL AND m.evaluator_model <> m.generator_model THEN
          v_signals := v_signals || 'USAGE_MODEL_UNKNOWN';
        END IF;
      ELSE
        v_unknown := v_unknown || 'AI_COMPUTE';
        v_signals := v_signals || 'MODEL_RATE_MISSING';
      END IF;
    END IF;
  END IF;

  -- Chi phí con người: chỉ theo chính sách cấu hình tường minh.
  SELECT * INTO h FROM public.human_cost_policies
   WHERE tenant_id = m.tenant_id AND status = 'ACTIVE'
     AND effective_from <= v_at AND (effective_to IS NULL OR effective_to > v_at)
   ORDER BY effective_from DESC, policy_version DESC LIMIT 1;
  IF FOUND THEN
    v_human := ROUND(COALESCE(m.human_review_events,0) * h.review_event_cost
                   + COALESCE(m.human_confirmations,0) * h.approval_event_cost, 6);
    v_human_status := CASE WHEN v_human = 0 THEN 'ZERO' ELSE 'CONFIGURED_EVENT_COST' END;
  ELSE
    v_unknown := v_unknown || 'HUMAN_REVIEW';
    v_signals := v_signals || 'HUMAN_COST_MISSING';
  END IF;

  v_unknown := v_unknown || 'PLATFORM' || 'EXTERNAL_SERVICE';
  v_signals := v_signals || 'PLATFORM_COST_MISSING';

  -- TUYỆT ĐỐI không cộng hai loại tiền khác nhau.
  IF v_ai IS NOT NULL AND v_human IS NOT NULL AND v_ai_currency IS NOT NULL
     AND h.currency IS NOT NULL AND v_ai_currency <> h.currency THEN
    v_known := NULL;
    v_signals := v_signals || 'CURRENCY_MISMATCH';
    v_currency := v_ai_currency;
  ELSE
    IF v_ai IS NULL AND v_human IS NULL THEN v_known := NULL;
    ELSE v_known := COALESCE(v_ai,0) + COALESCE(v_human,0); END IF;
    v_currency := COALESCE(v_ai_currency, h.currency, 'USD');
  END IF;

  IF array_length(v_unknown,1) IS NULL AND NOT ('CURRENCY_MISMATCH' = ANY(v_signals)) THEN
    v_complete := 'FULL';
  ELSIF v_ai_status = 'UNKNOWN' AND v_human_status = 'UNKNOWN' THEN
    v_complete := 'INSUFFICIENT';
  ELSE
    v_complete := 'PARTIAL';
  END IF;

  SELECT array_agg(DISTINCT x) INTO v_signals FROM unnest(v_signals) x;
  SELECT array_agg(DISTINCT x) INTO v_unknown FROM unnest(v_unknown) x;

  INSERT INTO public.work_execution_costs AS c (
    execution_id, tenant_id, workspace_id, work_unit_code, work_unit_version, currency,
    ai_compute_cost, ai_compute_status, rate_provider, rate_model, rate_version, rate_effective_at,
    human_cost, human_cost_status, human_policy_version,
    known_cost, unknown_components, completeness, computed_at,
    missing_signals, ai_currency, human_currency, ai_cost_breakdown
  ) VALUES (
    _execution_id, m.tenant_id, m.workspace_id, m.work_unit_code, m.work_unit_version, v_currency,
    v_ai, v_ai_status, r.provider, r.model, r.rate_version, r.effective_from,
    v_human, v_human_status, h.policy_version,
    v_known, COALESCE(v_unknown,'{}'), v_complete, now(),
    COALESCE(v_signals,'{}'), v_ai_currency, h.currency, v_breakdown
  )
  ON CONFLICT (execution_id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id, workspace_id = EXCLUDED.workspace_id,
    work_unit_code = EXCLUDED.work_unit_code, work_unit_version = EXCLUDED.work_unit_version,
    currency = EXCLUDED.currency,
    ai_compute_cost = EXCLUDED.ai_compute_cost, ai_compute_status = EXCLUDED.ai_compute_status,
    rate_provider = EXCLUDED.rate_provider, rate_model = EXCLUDED.rate_model,
    rate_version = EXCLUDED.rate_version, rate_effective_at = EXCLUDED.rate_effective_at,
    human_cost = EXCLUDED.human_cost, human_cost_status = EXCLUDED.human_cost_status,
    human_policy_version = EXCLUDED.human_policy_version,
    known_cost = EXCLUDED.known_cost, unknown_components = EXCLUDED.unknown_components,
    completeness = EXCLUDED.completeness, computed_at = now(),
    missing_signals = EXCLUDED.missing_signals, ai_currency = EXCLUDED.ai_currency,
    human_currency = EXCLUDED.human_currency, ai_cost_breakdown = EXCLUDED.ai_cost_breakdown
  RETURNING c.* INTO out_row;

  RETURN out_row;
END $$;

-- 6) Sửa chữa nhật ký bước khi ghi nhận thất bại (không bịa bước không chứng minh được)
CREATE OR REPLACE FUNCTION public.reconcile_work_execution_steps(_execution_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e public.ai_task_executions%ROWTYPE; v_steps integer; v_expected integer := 6;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501'; END IF;
  SELECT * INTO e FROM public.ai_task_executions WHERE id = _execution_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'EXECUTION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.is_tenant_member(e.tenant_id) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;

  SELECT count(*) INTO v_steps FROM public.work_execution_steps WHERE execution_id = _execution_id;

  RETURN jsonb_build_object(
    'executionId', _execution_id,
    'recordedSteps', v_steps,
    'expectedSteps', v_expected,
    'evidenceCompleteness', CASE WHEN v_steps >= v_expected THEN 'COMPLETE' ELSE 'PARTIAL' END,
    'gap', GREATEST(v_expected - v_steps, 0)
  );
END $$;

REVOKE ALL ON FUNCTION public.recompute_work_execution_cost(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.record_ai_usage_event(uuid,text,text,integer,integer,text,integer,text) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_work_execution_steps(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.recompute_work_execution_cost(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_ai_usage_event(uuid,text,text,integer,integer,text,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_work_execution_steps(uuid) TO authenticated;