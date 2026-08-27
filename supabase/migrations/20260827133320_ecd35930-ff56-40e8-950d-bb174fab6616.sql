
-- ============ WE-3: Work Pricing & Unit Economics Foundation ============
-- Nguyên tắc: KHÔNG có tín hiệu != 0. Chi phí không đo được -> UNKNOWN.

-- 1) Bảng giá mô hình (cấu hình, KHÔNG phải bí mật)
CREATE TABLE IF NOT EXISTS public.ai_model_cost_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model text NOT NULL,
  rate_version integer NOT NULL DEFAULT 1,
  input_token_rate numeric(18,8) NOT NULL CHECK (input_token_rate >= 0),
  output_token_rate numeric(18,8) NOT NULL CHECK (output_token_rate >= 0),
  rate_unit text NOT NULL DEFAULT 'PER_1M_TOKENS' CHECK (rate_unit = 'PER_1M_TOKENS'),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','VND','EUR')),
  source text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, model, rate_version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_model_cost_rates TO authenticated;
GRANT ALL ON public.ai_model_cost_rates TO service_role;
ALTER TABLE public.ai_model_cost_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rates_read_internal" ON public.ai_model_cost_rates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));
CREATE POLICY "rates_write_admin" ON public.ai_model_cost_rates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 2) Chính sách chi phí con người (chỉ dùng khi cấu hình tường minh)
CREATE TABLE IF NOT EXISTS public.human_cost_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  policy_version integer NOT NULL DEFAULT 1,
  basis text NOT NULL DEFAULT 'CONFIGURED_EVENT_COST' CHECK (basis = 'CONFIGURED_EVENT_COST'),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','VND','EUR')),
  review_event_cost numeric(18,6) NOT NULL DEFAULT 0 CHECK (review_event_cost >= 0),
  approval_event_cost numeric(18,6) NOT NULL DEFAULT 0 CHECK (approval_event_cost >= 0),
  change_request_cost numeric(18,6) NOT NULL DEFAULT 0 CHECK (change_request_cost >= 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, policy_version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.human_cost_policies TO authenticated;
GRANT ALL ON public.human_cost_policies TO service_role;
ALTER TABLE public.human_cost_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "human_cost_read_internal" ON public.human_cost_policies FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator')));
CREATE POLICY "human_cost_write_admin" ON public.human_cost_policies FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id) AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.is_tenant_member(tenant_id) AND public.has_role(auth.uid(),'admin'));

-- 3) Chi phí từng lượt chạy (server-authoritative, không có đường ghi từ client)
CREATE TABLE IF NOT EXISTS public.work_execution_costs (
  execution_id uuid PRIMARY KEY REFERENCES public.ai_task_executions(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  workspace_id uuid,
  work_unit_code text NOT NULL,
  work_unit_version integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  ai_compute_cost numeric(18,6),
  ai_compute_status text NOT NULL DEFAULT 'UNKNOWN' CHECK (ai_compute_status IN ('MEASURED','UNKNOWN','ZERO')),
  rate_provider text,
  rate_model text,
  rate_version integer,
  rate_effective_at timestamptz,
  human_cost numeric(18,6),
  human_cost_status text NOT NULL DEFAULT 'UNKNOWN' CHECK (human_cost_status IN ('CONFIGURED_EVENT_COST','UNKNOWN','ZERO')),
  human_policy_version integer,
  platform_cost numeric(18,6),
  platform_cost_status text NOT NULL DEFAULT 'UNKNOWN',
  external_cost numeric(18,6),
  external_cost_status text NOT NULL DEFAULT 'UNKNOWN',
  known_cost numeric(18,6) NOT NULL DEFAULT 0,
  unknown_components text[] NOT NULL DEFAULT '{}',
  completeness text NOT NULL DEFAULT 'INSUFFICIENT' CHECK (completeness IN ('FULL','PARTIAL','INSUFFICIENT')),
  cost_model_version text NOT NULL DEFAULT 'we3.cost.v1',
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_work_execution_costs_unit ON public.work_execution_costs(work_unit_code, work_unit_version, computed_at DESC);
GRANT SELECT ON public.work_execution_costs TO authenticated;
GRANT ALL ON public.work_execution_costs TO service_role;
ALTER TABLE public.work_execution_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exec_costs_read_internal" ON public.work_execution_costs FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator')));

-- 4) Chính sách giá theo phiên bản (phân tích/cấu hình — KHÔNG thanh toán)
CREATE TABLE IF NOT EXISTS public.work_pricing_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  work_unit_code text NOT NULL,
  work_unit_version integer NOT NULL,
  pricing_version integer NOT NULL DEFAULT 1,
  pricing_model text NOT NULL CHECK (pricing_model IN ('PER_EXECUTION','PER_ACCEPTED_OUTCOME','BUNDLE','SUBSCRIPTION_INCLUDED','CUSTOM')),
  commercial_unit text NOT NULL DEFAULT 'ACCEPTED_OUTCOME' CHECK (commercial_unit IN ('EXECUTION','ACCEPTED_OUTCOME')),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','VND','EUR')),
  unit_price numeric(18,6) CHECK (unit_price IS NULL OR unit_price > 0),
  bundle_quantity integer CHECK (bundle_quantity IS NULL OR bundle_quantity > 0),
  bundle_price numeric(18,6) CHECK (bundle_price IS NULL OR bundle_price > 0),
  included_quantity integer CHECK (included_quantity IS NULL OR included_quantity >= 0),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, work_unit_code, work_unit_version, pricing_version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_pricing_policies TO authenticated;
GRANT ALL ON public.work_pricing_policies TO service_role;
ALTER TABLE public.work_pricing_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing_read_internal" ON public.work_pricing_policies FOR SELECT TO authenticated
  USING ((tenant_id IS NULL OR public.is_tenant_member(tenant_id))
         AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator')));
CREATE POLICY "pricing_write_admin" ON public.work_pricing_policies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') AND (tenant_id IS NULL OR public.is_tenant_member(tenant_id)))
  WITH CHECK (public.has_role(auth.uid(),'admin') AND (tenant_id IS NULL OR public.is_tenant_member(tenant_id)));

-- Giá đã ACTIVE là bất biến về ngữ nghĩa: chỉ được RETIRE.
CREATE OR REPLACE FUNCTION public.work_pricing_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'ACTIVE' THEN
    IF NEW.unit_price IS DISTINCT FROM OLD.unit_price
       OR NEW.pricing_model IS DISTINCT FROM OLD.pricing_model
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.bundle_price IS DISTINCT FROM OLD.bundle_price
       OR NEW.bundle_quantity IS DISTINCT FROM OLD.bundle_quantity THEN
      RAISE EXCEPTION 'PRICING_VERSION_IMMUTABLE: tạo phiên bản giá mới thay vì sửa bản đang áp dụng';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_work_pricing_guard ON public.work_pricing_policies;
CREATE TRIGGER trg_work_pricing_guard BEFORE UPDATE ON public.work_pricing_policies
  FOR EACH ROW EXECUTE FUNCTION public.work_pricing_guard();

-- 5) Tính lại chi phí một lượt chạy (idempotent, tất định)
CREATE OR REPLACE FUNCTION public.recompute_work_execution_cost(_execution_id uuid)
RETURNS public.work_execution_costs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m public.work_execution_metrics%ROWTYPE;
  r public.ai_model_cost_rates%ROWTYPE;
  h public.human_cost_policies%ROWTYPE;
  v_ai numeric := NULL; v_ai_status text := 'UNKNOWN';
  v_human numeric := NULL; v_human_status text := 'UNKNOWN';
  v_unknown text[] := '{}';
  v_known numeric := 0;
  v_complete text := 'PARTIAL';
  v_at timestamptz;
  out_row public.work_execution_costs;
BEGIN
  SELECT * INTO m FROM public.work_execution_metrics WHERE execution_id = _execution_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_at := COALESCE(m.machine_started_at, m.wall_started_at, m.computed_at);

  -- AI compute: chỉ tính khi có token thật VÀ có bảng giá hiệu lực
  IF m.token_source = 'MISSING' OR m.total_tokens IS NULL THEN
    v_ai_status := 'UNKNOWN';
    v_unknown := v_unknown || 'AI_COMPUTE';
  ELSIF m.total_tokens = 0 THEN
    v_ai := 0; v_ai_status := 'ZERO';
  ELSE
    SELECT * INTO r FROM public.ai_model_cost_rates
     WHERE model = m.generator_model AND status = 'ACTIVE'
       AND effective_from <= v_at AND (effective_to IS NULL OR effective_to > v_at)
     ORDER BY effective_from DESC, rate_version DESC LIMIT 1;
    IF FOUND THEN
      v_ai := ROUND((COALESCE(m.input_tokens,0)::numeric / 1000000) * r.input_token_rate
                  + (COALESCE(m.output_tokens,0)::numeric / 1000000) * r.output_token_rate, 6);
      v_ai_status := 'MEASURED';
    ELSE
      v_ai_status := 'UNKNOWN';
      v_unknown := v_unknown || 'AI_COMPUTE';
    END IF;
  END IF;

  -- Chi phí con người: CHỈ khi có chính sách cấu hình tường minh. Không suy từ wall time.
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
  END IF;

  -- Platform & external: chưa có telemetry -> UNKNOWN (không bịa phân bổ)
  v_unknown := v_unknown || 'PLATFORM' || 'EXTERNAL_SERVICE';

  v_known := COALESCE(v_ai,0) + COALESCE(v_human,0);
  IF array_length(v_unknown,1) IS NULL THEN v_complete := 'FULL';
  ELSIF v_ai_status = 'UNKNOWN' AND v_human_status = 'UNKNOWN' THEN v_complete := 'INSUFFICIENT';
  ELSE v_complete := 'PARTIAL'; END IF;

  INSERT INTO public.work_execution_costs AS c (
    execution_id, tenant_id, workspace_id, work_unit_code, work_unit_version, currency,
    ai_compute_cost, ai_compute_status, rate_provider, rate_model, rate_version, rate_effective_at,
    human_cost, human_cost_status, human_policy_version,
    known_cost, unknown_components, completeness, computed_at
  ) VALUES (
    _execution_id, m.tenant_id, m.workspace_id, m.work_unit_code, m.work_unit_version,
    COALESCE(r.currency, h.currency, 'USD'),
    v_ai, v_ai_status, r.provider, r.model, r.rate_version, r.effective_from,
    v_human, v_human_status, h.policy_version,
    v_known, v_unknown, v_complete, now()
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
    completeness = EXCLUDED.completeness, computed_at = now()
  RETURNING c.* INTO out_row;

  RETURN out_row;
END $$;
REVOKE ALL ON FUNCTION public.recompute_work_execution_cost(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.recompute_work_execution_cost(uuid) TO authenticated, service_role;

-- 6) Tổng hợp kinh tế đơn vị theo sản phẩm công việc (tách theo phiên bản)
CREATE OR REPLACE FUNCTION public.work_product_economics(
  _code text, _version integer, _tenant_id uuid, _workspace_id uuid DEFAULT NULL,
  _from timestamptz DEFAULT now() - interval '90 days', _to timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb; missing text[] := '{}';
BEGIN
  IF NOT public.is_tenant_member(_tenant_id) THEN
    RAISE EXCEPTION 'FORBIDDEN_TENANT';
  END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator')) THEN
    RAISE EXCEPTION 'FORBIDDEN_INTERNAL_ECONOMICS';
  END IF;

  WITH base AS (
    SELECT m.*, e.status AS exec_status, e.change_request, e.accepted_with_warnings,
           c.known_cost, c.completeness AS cost_completeness, c.currency,
           c.ai_compute_cost, c.human_cost, c.unknown_components
      FROM public.work_execution_metrics m
      JOIN public.ai_task_executions e ON e.id = m.execution_id
      LEFT JOIN public.work_execution_costs c ON c.execution_id = m.execution_id
     WHERE m.tenant_id = _tenant_id
       AND (_workspace_id IS NULL OR m.workspace_id = _workspace_id)
       AND m.work_unit_code = _code AND m.work_unit_version = _version
       AND m.computed_at >= _from AND m.computed_at <= _to
  )
  SELECT jsonb_build_object(
    'workUnitCode', _code,
    'workUnitVersion', _version,
    'from', _from, 'to', _to,
    'executions', COUNT(*),
    'acceptedExecutions', COUNT(*) FILTER (WHERE outcome_accepted IS TRUE),
    'verifiedOutcomes', COUNT(*) FILTER (WHERE outcome_verified IS TRUE),
    'changeRequests', COUNT(*) FILTER (WHERE change_request IS NOT NULL),
    'firstPassAccepted', COUNT(*) FILTER (WHERE outcome_accepted IS TRUE AND revision = 1 AND change_request IS NULL),
    'reviewedExecutions', COUNT(*) FILTER (WHERE outcome_accepted IS NOT NULL OR change_request IS NOT NULL),
    'avgRevisions', ROUND(AVG(revision_count)::numeric, 2),
    'avgHumanApprovals', ROUND(AVG(human_confirmations)::numeric, 2),
    'avgHumanReviews', ROUND(AVG(human_review_events)::numeric, 2),
    'avgMachineDurationMs', ROUND(AVG(machine_duration_ms)::numeric, 0),
    'avgModelCalls', ROUND(AVG(model_calls)::numeric, 2),
    'avgTokens', ROUND(AVG(total_tokens)::numeric, 0),
    'avgQualityScore', ROUND(AVG(quality_score)::numeric, 1),
    'slaEvaluated', COUNT(*) FILTER (WHERE sla_met IS NOT NULL),
    'slaMet', COUNT(*) FILTER (WHERE sla_met IS TRUE),
    'knownCostTotal', COALESCE(SUM(known_cost), 0),
    'aiComputeCostTotal', SUM(ai_compute_cost),
    'humanCostTotal', SUM(human_cost),
    'costedExecutions', COUNT(*) FILTER (WHERE known_cost IS NOT NULL),
    'fullCostExecutions', COUNT(*) FILTER (WHERE cost_completeness = 'FULL'),
    'currency', COALESCE(MAX(currency), 'USD')
  ) INTO res FROM base;

  RETURN COALESCE(res, jsonb_build_object('workUnitCode', _code, 'workUnitVersion', _version, 'executions', 0));
END $$;
REVOKE ALL ON FUNCTION public.work_product_economics(text,integer,uuid,uuid,timestamptz,timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.work_product_economics(text,integer,uuid,uuid,timestamptz,timestamptz) TO authenticated, service_role;
