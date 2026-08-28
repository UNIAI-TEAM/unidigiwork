-- SWP-2 — RPC thương mại (server-authoritative). Ghi chỉ qua các hàm này.

CREATE OR REPLACE FUNCTION public.swp2_assert_admin_write()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'COMMERCIAL_ADMIN_REQUIRED'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.swp2_assert_admin_read()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator')) THEN
    RAISE EXCEPTION 'COMMERCIAL_ADMIN_REQUIRED';
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.create_sell_work_pilot(
  _tenant_id uuid, _customer_segment text DEFAULT NULL, _industry text DEFAULT NULL,
  _start_date date DEFAULT current_date, _target_end_date date DEFAULT NULL,
  _pilot_owner uuid DEFAULT NULL, _success_criteria jsonb DEFAULT '{}'::jsonb,
  _commercial_model text DEFAULT NULL, _notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.swp2_assert_admin_write();
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant_id) THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND';
  END IF;
  INSERT INTO public.sell_work_pilots(tenant_id, customer_segment, industry, start_date, target_end_date,
      pilot_owner, success_criteria, commercial_model, notes, created_by)
  VALUES (_tenant_id, _customer_segment, _industry, COALESCE(_start_date, current_date), _target_end_date,
      _pilot_owner, COALESCE(_success_criteria,'{}'::jsonb), _commercial_model, _notes, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.sell_work_commercial_events(pilot_id, tenant_id, event_type, actor_id)
  VALUES (v_id, _tenant_id, 'PILOT_CREATED', auth.uid());
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.upsert_sell_work_pilot_product(
  _pilot_id uuid, _code text, _version integer DEFAULT 1,
  _expected_user_group text DEFAULT NULL, _expected_frequency text DEFAULT NULL,
  _target_problem text DEFAULT NULL, _expected_deliverable text DEFAULT NULL,
  _success_criteria text DEFAULT NULL, _measurable_outcome text DEFAULT NULL,
  _commercial_hypothesis text DEFAULT NULL, _activate boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_tenant uuid; v_contract_ok boolean;
BEGIN
  PERFORM public.swp2_assert_admin_write();
  SELECT tenant_id INTO v_tenant FROM public.sell_work_pilots WHERE id = _pilot_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'PILOT_NOT_FOUND'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.work_units WHERE code = _code AND version = _version AND status = 'ACTIVE')
    INTO v_contract_ok;
  IF _activate AND NOT v_contract_ok THEN RAISE EXCEPTION 'WORK_PRODUCT_CONTRACT_NOT_ACTIVE'; END IF;

  INSERT INTO public.sell_work_pilot_products(pilot_id, work_unit_code, work_unit_version, expected_user_group,
      expected_frequency, target_problem, expected_deliverable, success_criteria, measurable_outcome,
      commercial_hypothesis, status, activated_at)
  VALUES (_pilot_id, _code, _version, _expected_user_group, _expected_frequency, _target_problem,
      _expected_deliverable, _success_criteria, _measurable_outcome, _commercial_hypothesis,
      CASE WHEN _activate THEN 'ACTIVE' ELSE 'PLANNED' END, CASE WHEN _activate THEN now() ELSE NULL END)
  ON CONFLICT (pilot_id, work_unit_code, work_unit_version) DO UPDATE SET
      expected_user_group = COALESCE(EXCLUDED.expected_user_group, sell_work_pilot_products.expected_user_group),
      expected_frequency = COALESCE(EXCLUDED.expected_frequency, sell_work_pilot_products.expected_frequency),
      target_problem = COALESCE(EXCLUDED.target_problem, sell_work_pilot_products.target_problem),
      expected_deliverable = COALESCE(EXCLUDED.expected_deliverable, sell_work_pilot_products.expected_deliverable),
      success_criteria = COALESCE(EXCLUDED.success_criteria, sell_work_pilot_products.success_criteria),
      measurable_outcome = COALESCE(EXCLUDED.measurable_outcome, sell_work_pilot_products.measurable_outcome),
      commercial_hypothesis = COALESCE(EXCLUDED.commercial_hypothesis, sell_work_pilot_products.commercial_hypothesis),
      status = CASE WHEN _activate THEN 'ACTIVE' ELSE sell_work_pilot_products.status END,
      activated_at = CASE WHEN _activate THEN COALESCE(sell_work_pilot_products.activated_at, now())
                          ELSE sell_work_pilot_products.activated_at END
  RETURNING id INTO v_id;

  IF _activate THEN
    INSERT INTO public.sell_work_commercial_events(pilot_id, tenant_id, event_type, work_unit_code, work_unit_version, actor_id)
    VALUES (_pilot_id, v_tenant, 'WORK_PRODUCT_ACTIVATED', _code, _version, auth.uid());
  END IF;
  RETURN v_id;
END; $$;

-- Chuyển trạng thái pilot: bảng chuyển hợp lệ tường minh, kiểm tra điều kiện kích hoạt.
CREATE OR REPLACE FUNCTION public.set_sell_work_pilot_status(
  _pilot_id uuid, _status text, _reason text DEFAULT NULL, _secondary_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p record; v_allowed text[]; v_active_products int;
BEGIN
  PERFORM public.swp2_assert_admin_write();
  SELECT * INTO p FROM public.sell_work_pilots WHERE id = _pilot_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'PILOT_NOT_FOUND'; END IF;

  v_allowed := CASE p.status
    WHEN 'PROSPECT' THEN ARRAY['QUALIFIED','LOST','PAUSED']
    WHEN 'QUALIFIED' THEN ARRAY['ONBOARDING','LOST','PAUSED']
    WHEN 'ONBOARDING' THEN ARRAY['ACTIVE_PILOT','LOST','PAUSED']
    WHEN 'ACTIVE_PILOT' THEN ARRAY['VALUE_PROVEN','PAID_PILOT','REPEAT_USAGE','PAUSED','LOST']
    WHEN 'VALUE_PROVEN' THEN ARRAY['PAID_PILOT','REPEAT_USAGE','EXPANSION_SIGNAL','PAUSED','LOST']
    WHEN 'PAID_PILOT' THEN ARRAY['REPEAT_USAGE','EXPANSION_SIGNAL','PAUSED','LOST']
    WHEN 'REPEAT_USAGE' THEN ARRAY['EXPANSION_SIGNAL','PAID_PILOT','PAUSED','LOST']
    WHEN 'EXPANSION_SIGNAL' THEN ARRAY['PAID_PILOT','PAUSED','LOST']
    WHEN 'PAUSED' THEN ARRAY['ACTIVE_PILOT','LOST']
    WHEN 'LOST' THEN ARRAY[]::text[]
    ELSE ARRAY[]::text[] END;

  IF NOT (_status = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'INVALID_PILOT_TRANSITION: % -> %', p.status, _status;
  END IF;

  IF _status = 'ACTIVE_PILOT' THEN
    SELECT count(*) INTO v_active_products FROM public.sell_work_pilot_products
      WHERE pilot_id = _pilot_id AND status = 'ACTIVE';
    IF v_active_products = 0 THEN RAISE EXCEPTION 'PILOT_PREREQUISITE_MISSING: WORK_PRODUCT_NOT_ACTIVE'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = p.tenant_id AND status = 'active') THEN
      RAISE EXCEPTION 'PILOT_PREREQUISITE_MISSING: NO_AUTHORIZED_USERS';
    END IF;
  END IF;

  IF _status = 'PAID_PILOT' AND p.paid_verified_at IS NULL THEN
    RAISE EXCEPTION 'PAID_PILOT_REQUIRES_VERIFICATION';
  END IF;

  IF _status = 'LOST' AND _reason IS NULL THEN
    RAISE EXCEPTION 'LOST_REASON_REQUIRED';
  END IF;

  UPDATE public.sell_work_pilots SET
    status = _status,
    activated_at = CASE WHEN _status = 'ACTIVE_PILOT' THEN COALESCE(activated_at, now()) ELSE activated_at END,
    lost_primary_reason = CASE WHEN _status = 'LOST' THEN _reason ELSE lost_primary_reason END,
    lost_secondary_reason = CASE WHEN _status = 'LOST' THEN _secondary_reason ELSE lost_secondary_reason END
  WHERE id = _pilot_id;

  INSERT INTO public.sell_work_commercial_events(pilot_id, tenant_id, event_type, payload, actor_id)
  VALUES (_pilot_id, p.tenant_id,
    CASE WHEN _status = 'ACTIVE_PILOT' THEN 'PILOT_ACTIVATED'
         WHEN _status = 'LOST' THEN 'PILOT_LOST'
         WHEN _status = 'PAID_PILOT' THEN 'PAID_PILOT_CONFIRMED'
         WHEN _status = 'EXPANSION_SIGNAL' THEN 'EXPANSION_DISCUSSION'
         WHEN _status = 'VALUE_PROVEN' THEN 'VALUE_CONFIRMED'
         ELSE 'STATUS_CHANGED' END,
    jsonb_build_object('from', p.status, 'to', _status, 'reason', _reason), auth.uid());

  RETURN jsonb_build_object('pilotId', _pilot_id, 'from', p.status, 'to', _status);
END; $$;

CREATE OR REPLACE FUNCTION public.set_sell_work_pilot_wtp(
  _pilot_id uuid, _signal text, _amount numeric DEFAULT NULL, _currency text DEFAULT NULL, _billing_basis text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant uuid;
BEGIN
  PERFORM public.swp2_assert_admin_write();
  SELECT tenant_id INTO v_tenant FROM public.sell_work_pilots WHERE id = _pilot_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'PILOT_NOT_FOUND'; END IF;
  UPDATE public.sell_work_pilots
     SET wtp_signal = _signal, wtp_amount = _amount, wtp_currency = _currency, wtp_billing_basis = _billing_basis
   WHERE id = _pilot_id;
  INSERT INTO public.sell_work_commercial_events(pilot_id, tenant_id, event_type, payload, actor_id)
  VALUES (_pilot_id, v_tenant, 'PRICE_DISCUSSION_STARTED',
          jsonb_build_object('signal', _signal, 'amount', _amount, 'currency', _currency), auth.uid());
END; $$;

CREATE OR REPLACE FUNCTION public.verify_sell_work_paid_pilot(
  _pilot_id uuid, _evidence_reference text, _amount numeric, _currency text,
  _revenue_class text DEFAULT 'PILOT_FEE', _revenue_group text DEFAULT 'SELL_WORK')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tenant uuid;
BEGIN
  PERFORM public.swp2_assert_admin_write();
  IF _evidence_reference IS NULL OR length(trim(_evidence_reference)) < 3 THEN
    RAISE EXCEPTION 'PAID_PILOT_EVIDENCE_REQUIRED';
  END IF;
  SELECT tenant_id INTO v_tenant FROM public.sell_work_pilots WHERE id = _pilot_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'PILOT_NOT_FOUND'; END IF;
  UPDATE public.sell_work_pilots
     SET paid_verified_by = auth.uid(), paid_verified_at = now(),
         paid_evidence_reference = _evidence_reference,
         wtp_signal = 'PAID_PILOT', contract_value = _amount, currency = _currency
   WHERE id = _pilot_id;
  INSERT INTO public.sell_work_revenue_records(pilot_id, revenue_class, revenue_group, amount, currency,
      verified_by, verified_at, evidence_reference)
  VALUES (_pilot_id, _revenue_class, _revenue_group, _amount, _currency, auth.uid(), now(), _evidence_reference);
END; $$;

CREATE OR REPLACE FUNCTION public.record_sell_work_pricing_experiment(
  _pilot_id uuid, _code text, _version integer, _pricing_basis text, _price numeric, _currency text,
  _included_volume integer DEFAULT NULL, _overage_price numeric DEFAULT NULL, _notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_tenant uuid;
BEGIN
  PERFORM public.swp2_assert_admin_write();
  SELECT tenant_id INTO v_tenant FROM public.sell_work_pilots WHERE id = _pilot_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'PILOT_NOT_FOUND'; END IF;
  IF _price <= 0 THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;
  INSERT INTO public.sell_work_pricing_experiments(pilot_id, work_unit_code, work_unit_version, pricing_basis,
      price, currency, included_volume, overage_price, notes, created_by)
  VALUES (_pilot_id, _code, _version, _pricing_basis, _price, _currency, _included_volume, _overage_price, _notes, auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.sell_work_commercial_events(pilot_id, tenant_id, event_type, work_unit_code, work_unit_version, payload, actor_id)
  VALUES (_pilot_id, v_tenant, 'PRICE_DISCUSSION_STARTED', _code, _version,
      jsonb_build_object('price', _price, 'currency', _currency, 'basis', _pricing_basis), auth.uid());
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.set_sell_work_pricing_response(
  _experiment_id uuid, _response text, _notes text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.swp2_assert_admin_write();
  UPDATE public.sell_work_pricing_experiments
     SET customer_response = _response, responded_at = now(), notes = COALESCE(_notes, notes)
   WHERE id = _experiment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRICING_EXPERIMENT_NOT_FOUND'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.record_sell_work_pilot_support(
  _pilot_id uuid, _category text, _minutes integer DEFAULT NULL, _summary text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.swp2_assert_admin_write();
  IF NOT EXISTS (SELECT 1 FROM public.sell_work_pilots WHERE id = _pilot_id) THEN RAISE EXCEPTION 'PILOT_NOT_FOUND'; END IF;
  INSERT INTO public.sell_work_pilot_support(pilot_id, category, minutes, summary, created_by)
  VALUES (_pilot_id, _category, _minutes, _summary, auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
