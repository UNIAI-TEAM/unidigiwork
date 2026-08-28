-- SWP-2 — Phân tích pilot (server-authoritative, chỉ metadata + số liệu tổng hợp).

CREATE OR REPLACE FUNCTION public.compute_sell_work_pilot_metrics(
  _pilot_id uuid, _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p record; v_from timestamptz; v_products jsonb; v_exec jsonb; v_fb jsonb;
        v_support jsonb; v_revenue jsonb; v_health text; v_factors jsonb;
        v_repeat_products int := 0; v_total_products int := 0;
        v_accepted int := 0; v_total int := 0; v_quality numeric; v_fp numeric;
        v_ttfv bigint; v_ttrv bigint; v_last timestamptz;
BEGIN
  PERFORM public.swp2_assert_admin_read();
  SELECT * INTO p FROM public.sell_work_pilots WHERE id = _pilot_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'PILOT_NOT_FOUND'; END IF;
  v_from := COALESCE(_from, COALESCE(p.activated_at, p.start_date::timestamptz));

  WITH prod AS (
    SELECT pp.* FROM public.sell_work_pilot_products pp WHERE pp.pilot_id = _pilot_id
  ), ex AS (
    SELECT e.*, pr.work_unit_code AS pcode,
           m.human_confirmations, m.human_review_events, m.sla_met, m.outcome_verified,
           c.known_cost, c.currency, c.completeness AS cost_completeness,
           m.generator_model
    FROM prod pr
    JOIN public.ai_task_executions e
      ON e.tenant_id = p.tenant_id AND e.work_unit_code = pr.work_unit_code
     AND e.work_unit_version = pr.work_unit_version
    LEFT JOIN public.work_execution_metrics m ON m.execution_id = e.id
    LEFT JOIN public.work_execution_costs c ON c.execution_id = e.id
    WHERE e.contract_hash IS NOT NULL
      AND e.cohort_class = 'REAL' AND e.cohort_exclusion_reason IS NULL
      AND e.created_at >= v_from AND e.created_at <= _to
      AND e.status IN ('ACCEPTED','WAITING_REVIEW','CHANGES_REQUESTED','FAILED')
  ), per_product AS (
    SELECT pcode,
           count(*)::int AS executions,
           count(*) FILTER (WHERE status='ACCEPTED')::int AS accepted,
           count(DISTINCT date_trunc('week', created_at)) FILTER (WHERE status='ACCEPTED')::int AS accepted_periods,
           count(DISTINCT date_trunc('week', created_at))::int AS active_periods
    FROM ex GROUP BY pcode
  )
  SELECT
    (SELECT jsonb_agg(jsonb_build_object(
        'code', pr.work_unit_code, 'version', pr.work_unit_version, 'status', pr.status,
        'activatedAt', pr.activated_at, 'expectedFrequency', pr.expected_frequency,
        'expectedUserGroup', pr.expected_user_group, 'targetProblem', pr.target_problem,
        'expectedDeliverable', pr.expected_deliverable, 'successCriteria', pr.success_criteria,
        'measurableOutcome', pr.measurable_outcome, 'commercialHypothesis', pr.commercial_hypothesis,
        'executions', COALESCE(pp.executions,0), 'acceptedExecutions', COALESCE(pp.accepted,0),
        'activePeriods', COALESCE(pp.active_periods,0),
        'repeatSignal', CASE WHEN COALESCE(pp.active_periods,0) >= 4 THEN 'STRONG_REPEAT_SIGNAL'
                             WHEN COALESCE(pp.active_periods,0) >= 2 THEN 'REPEAT_SIGNAL'
                             ELSE 'NONE' END))
     FROM prod pr LEFT JOIN per_product pp ON pp.pcode = pr.work_unit_code),
    (SELECT jsonb_build_object(
        'totalExecutions', count(*)::int,
        'completedExecutions', count(*) FILTER (WHERE status<>'FAILED')::int,
        'acceptedExecutions', count(*) FILTER (WHERE status='ACCEPTED')::int,
        'failedExecutions', count(*) FILTER (WHERE status='FAILED')::int,
        'firstPassAccepted', count(*) FILTER (WHERE status='ACCEPTED' AND COALESCE(revision,0)=0)::int,
        'firstPassAcceptanceRate', CASE WHEN count(*) FILTER (WHERE status<>'FAILED') > 0
            THEN round(100.0*count(*) FILTER (WHERE status='ACCEPTED' AND COALESCE(revision,0)=0)
                 / count(*) FILTER (WHERE status<>'FAILED'),1) END,
        'finalAcceptanceRate', CASE WHEN count(*) FILTER (WHERE status<>'FAILED') > 0
            THEN round(100.0*count(*) FILTER (WHERE status='ACCEPTED') / count(*) FILTER (WHERE status<>'FAILED'),1) END,
        'averageQualityScore', round(avg(quality_score) FILTER (WHERE quality_score IS NOT NULL),1),
        'medianQualityScore', percentile_cont(0.5) WITHIN GROUP (ORDER BY quality_score) FILTER (WHERE quality_score IS NOT NULL),
        'averageRevisions', round(avg(revision) FILTER (WHERE status<>'FAILED'),2),
        'averageHumanInterventions', round(avg(COALESCE(human_confirmations,0)+COALESCE(human_review_events,0)),2),
        'slaPassRate', CASE WHEN count(*) FILTER (WHERE sla_met IS NOT NULL) > 0
            THEN round(100.0*count(*) FILTER (WHERE sla_met IS TRUE)/count(*) FILTER (WHERE sla_met IS NOT NULL),1) END,
        'slaKnownCount', count(*) FILTER (WHERE sla_met IS NOT NULL)::int,
        'verifiedOutcomeRate', CASE WHEN count(*) FILTER (WHERE outcome_verified IS NOT NULL) > 0
            THEN round(100.0*count(*) FILTER (WHERE outcome_verified IS TRUE)/count(*) FILTER (WHERE outcome_verified IS NOT NULL),1) END,
        'verifiedOutcomeKnownCount', count(*) FILTER (WHERE outcome_verified IS NOT NULL)::int,
        'currency', min(currency) FILTER (WHERE currency IS NOT NULL),
        'currencyMismatch', count(DISTINCT currency) FILTER (WHERE currency IS NOT NULL) > 1,
        'knownCostTotal', sum(known_cost) FILTER (WHERE known_cost IS NOT NULL),
        'costKnownCount', count(*) FILTER (WHERE known_cost IS NOT NULL)::int,
        'costFullCount', count(*) FILTER (WHERE cost_completeness='FULL')::int,
        'knownCostPerExecution', CASE WHEN count(*) FILTER (WHERE known_cost IS NOT NULL) > 0
            AND count(DISTINCT currency) FILTER (WHERE currency IS NOT NULL) <= 1
            THEN round(sum(known_cost) FILTER (WHERE known_cost IS NOT NULL)
                 / count(*) FILTER (WHERE known_cost IS NOT NULL), 6) END,
        'knownCostPerAcceptedWork', CASE WHEN count(*) FILTER (WHERE status='ACCEPTED' AND known_cost IS NOT NULL) > 0
            AND count(DISTINCT currency) FILTER (WHERE currency IS NOT NULL) <= 1
            THEN round(sum(known_cost) FILTER (WHERE status='ACCEPTED' AND known_cost IS NOT NULL)
                 / count(*) FILTER (WHERE status='ACCEPTED' AND known_cost IS NOT NULL), 6) END,
        'models', (SELECT jsonb_agg(jsonb_build_object('model', g.generator_model, 'executions', g.n))
                   FROM (SELECT generator_model, count(*)::int n FROM ex WHERE generator_model IS NOT NULL
                         GROUP BY generator_model) g)
     ) FROM ex),
    (SELECT count(*) FILTER (WHERE COALESCE(pp.active_periods,0) >= 2)::int FROM prod pr LEFT JOIN per_product pp ON pp.pcode=pr.work_unit_code),
    (SELECT count(*)::int FROM prod),
    (SELECT count(*) FILTER (WHERE status='ACCEPTED')::int FROM ex),
    (SELECT count(*)::int FROM ex),
    (SELECT max(created_at) FROM ex)
  INTO v_products, v_exec, v_repeat_products, v_total_products, v_accepted, v_total, v_last;

  SELECT jsonb_build_object(
      'responses', count(*)::int,
      'veryUseful', count(*) FILTER (WHERE usefulness='USEFUL')::int,
      'partial', count(*) FILTER (WHERE usefulness='PARTIALLY_USEFUL')::int,
      'notUseful', count(*) FILTER (WHERE usefulness='NOT_USEFUL')::int,
      'wouldUseAgainYes', count(*) FILTER (WHERE would_use_again='YES')::int,
      'selfReportedTimeSavedMinutes', sum(estimated_time_saved_minutes))
    INTO v_fb
  FROM public.work_execution_feedback f
  WHERE f.tenant_id = p.tenant_id AND f.created_at >= v_from AND f.created_at <= _to;

  SELECT jsonb_build_object(
      'interventions', count(*)::int,
      'minutes', COALESCE(sum(minutes),0)::int,
      'customEngineering', count(*) FILTER (WHERE category='CUSTOM_ENGINEERING')::int,
      'dataSetup', count(*) FILTER (WHERE category='DATA_SETUP')::int,
      'training', count(*) FILTER (WHERE category='TRAINING')::int,
      'productSupport', count(*) FILTER (WHERE category='PRODUCT_SUPPORT')::int,
      'bug', count(*) FILTER (WHERE category='BUG')::int,
      'customConfig', count(*) FILTER (WHERE category='CUSTOM_CONFIG')::int)
    INTO v_support FROM public.sell_work_pilot_support WHERE pilot_id = _pilot_id;

  SELECT jsonb_build_object(
      'records', count(*)::int,
      'software', COALESCE(sum(amount) FILTER (WHERE revenue_group='SOFTWARE'),0),
      'sellWork', COALESCE(sum(amount) FILTER (WHERE revenue_group='SELL_WORK'),0),
      'services', COALESCE(sum(amount) FILTER (WHERE revenue_group='SERVICES'),0),
      'currencies', COALESCE(jsonb_agg(DISTINCT currency),'[]'::jsonb))
    INTO v_revenue FROM public.sell_work_revenue_records WHERE pilot_id = _pilot_id;

  -- Thời gian tới giá trị đầu tiên / lặp lại (chỉ khi pilot đã kích hoạt).
  IF p.activated_at IS NOT NULL THEN
    WITH acc AS (
      SELECT e.created_at FROM public.sell_work_pilot_products pr
      JOIN public.ai_task_executions e ON e.tenant_id = p.tenant_id
        AND e.work_unit_code = pr.work_unit_code AND e.work_unit_version = pr.work_unit_version
      WHERE pr.pilot_id = _pilot_id AND e.status='ACCEPTED' AND e.cohort_class='REAL'
        AND e.created_at >= p.activated_at
      ORDER BY e.created_at ASC LIMIT 2)
    SELECT (SELECT extract(epoch FROM (min(created_at) - p.activated_at))*1000 FROM acc),
           (SELECT extract(epoch FROM (max(created_at) - p.activated_at))*1000 FROM acc WHERE (SELECT count(*) FROM acc)=2)
      INTO v_ttfv, v_ttrv;
  END IF;

  v_quality := (v_exec->>'averageQualityScore')::numeric;
  v_fp := (v_exec->>'firstPassAcceptanceRate')::numeric;
  v_factors := jsonb_build_object(
    'activated', p.activated_at IS NOT NULL,
    'recentUsage', v_last IS NOT NULL AND v_last > now() - interval '14 days',
    'acceptanceOk', v_fp IS NOT NULL AND v_fp >= 70,
    'qualityOk', v_quality IS NOT NULL AND v_quality >= 75,
    'repeatUsage', v_repeat_products > 0,
    'commercialSignal', p.wtp_signal <> 'NO_SIGNAL');

  v_health := CASE
    WHEN p.status IN ('LOST') THEN 'RED'
    WHEN p.activated_at IS NULL THEN 'YELLOW'
    WHEN (v_factors->>'recentUsage')::boolean AND (v_factors->>'acceptanceOk')::boolean
         AND (v_factors->>'repeatUsage')::boolean THEN 'GREEN'
    WHEN v_total = 0 OR NOT (v_factors->>'recentUsage')::boolean THEN 'RED'
    ELSE 'YELLOW' END;

  RETURN jsonb_build_object(
    'pilotId', p.id, 'tenantId', p.tenant_id, 'status', p.status,
    'customerSegment', p.customer_segment, 'industry', p.industry,
    'startDate', p.start_date, 'targetEndDate', p.target_end_date,
    'activatedAt', p.activated_at, 'lastActivityAt', v_last,
    'commercialModel', p.commercial_model,
    'wtpSignal', p.wtp_signal, 'wtpAmount', p.wtp_amount, 'wtpCurrency', p.wtp_currency,
    'paidVerifiedAt', p.paid_verified_at, 'paidEvidenceReference', p.paid_evidence_reference,
    'lostPrimaryReason', p.lost_primary_reason,
    'windowFrom', v_from, 'windowTo', _to,
    'products', COALESCE(v_products, '[]'::jsonb),
    'productCount', v_total_products,
    'productsWithRepeatUsage', v_repeat_products,
    'execution', COALESCE(v_exec, '{}'::jsonb),
    'selfReported', COALESCE(v_fb, '{}'::jsonb),
    'support', COALESCE(v_support, '{}'::jsonb),
    'revenue', COALESCE(v_revenue, '{}'::jsonb),
    'timeToFirstAcceptedWorkMs', v_ttfv,
    'timeToSecondAcceptedWorkMs', v_ttrv,
    'health', v_health, 'healthFactors', v_factors,
    'sampleSize', v_total,
    'computedAt', now());
END; $$;

CREATE OR REPLACE FUNCTION public.compute_sell_work_pilot_portfolio(
  _from timestamptz DEFAULT (now() - interval '90 days'), _to timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_pilots jsonb; v_summary jsonb; v_services jsonb;
BEGIN
  PERFORM public.swp2_assert_admin_read();

  SELECT jsonb_build_object(
      'totalPilots', count(*)::int,
      'activePilots', count(*) FILTER (WHERE status IN ('ACTIVE_PILOT','VALUE_PROVEN','PAID_PILOT','REPEAT_USAGE','EXPANSION_SIGNAL'))::int,
      'paidPilots', count(*) FILTER (WHERE paid_verified_at IS NOT NULL)::int,
      'lostPilots', count(*) FILTER (WHERE status='LOST')::int,
      'pausedPilots', count(*) FILTER (WHERE status='PAUSED')::int,
      'expansionSignals', count(*) FILTER (WHERE status='EXPANSION_SIGNAL')::int,
      'customersWithWtpSignal', count(*) FILTER (WHERE wtp_signal <> 'NO_SIGNAL')::int,
      'activatedCustomers', count(*) FILTER (WHERE activated_at IS NOT NULL)::int,
      'lostReasons', COALESCE((SELECT jsonb_object_agg(lost_primary_reason, n) FROM
          (SELECT lost_primary_reason, count(*)::int n FROM public.sell_work_pilots
           WHERE lost_primary_reason IS NOT NULL GROUP BY 1) x), '{}'::jsonb))
    INTO v_summary FROM public.sell_work_pilots;

  SELECT jsonb_agg(jsonb_build_object(
      'pilotId', pl.id, 'tenantId', pl.tenant_id, 'tenantName', t.name,
      'status', pl.status, 'industry', pl.industry, 'customerSegment', pl.customer_segment,
      'activatedAt', pl.activated_at, 'wtpSignal', pl.wtp_signal,
      'paidVerifiedAt', pl.paid_verified_at,
      'products', COALESCE((SELECT jsonb_agg(pp.work_unit_code || ' v' || pp.work_unit_version)
                            FROM public.sell_work_pilot_products pp
                            WHERE pp.pilot_id = pl.id AND pp.status='ACTIVE'), '[]'::jsonb),
      'activeProductCount', (SELECT count(*)::int FROM public.sell_work_pilot_products pp
                             WHERE pp.pilot_id = pl.id AND pp.status='ACTIVE'),
      'executions', (SELECT count(*)::int FROM public.sell_work_pilot_products pp
                     JOIN public.ai_task_executions e ON e.tenant_id = pl.tenant_id
                       AND e.work_unit_code = pp.work_unit_code AND e.work_unit_version = pp.work_unit_version
                     WHERE pp.pilot_id = pl.id AND e.cohort_class='REAL'
                       AND e.created_at >= _from AND e.created_at <= _to),
      'acceptedExecutions', (SELECT count(*)::int FROM public.sell_work_pilot_products pp
                     JOIN public.ai_task_executions e ON e.tenant_id = pl.tenant_id
                       AND e.work_unit_code = pp.work_unit_code AND e.work_unit_version = pp.work_unit_version
                     WHERE pp.pilot_id = pl.id AND e.status='ACCEPTED' AND e.cohort_class='REAL'
                       AND e.created_at >= _from AND e.created_at <= _to),
      'supportInterventions', (SELECT count(*)::int FROM public.sell_work_pilot_support s WHERE s.pilot_id = pl.id)
    ) ORDER BY pl.created_at DESC)
    INTO v_pilots
  FROM public.sell_work_pilots pl LEFT JOIN public.tenants t ON t.id = pl.tenant_id;

  SELECT jsonb_build_object(
      'pilotsTotal', (SELECT count(*)::int FROM public.sell_work_pilots),
      'pilotsWithCustomEngineering', (SELECT count(DISTINCT pilot_id)::int FROM public.sell_work_pilot_support WHERE category='CUSTOM_ENGINEERING'),
      'pilotsWithManualDataSetup', (SELECT count(DISTINCT pilot_id)::int FROM public.sell_work_pilot_support WHERE category='DATA_SETUP'),
      'pilotsWithRepeatedSupport', (SELECT count(*)::int FROM (
          SELECT pilot_id FROM public.sell_work_pilot_support
          WHERE category IN ('PRODUCT_SUPPORT','TRAINING','BUG') GROUP BY pilot_id HAVING count(*) >= 3) y),
      'supportMinutesTotal', COALESCE((SELECT sum(minutes)::int FROM public.sell_work_pilot_support),0))
    INTO v_services;

  RETURN jsonb_build_object(
    'windowFrom', _from, 'windowTo', _to,
    'summary', v_summary,
    'pilots', COALESCE(v_pilots, '[]'::jsonb),
    'servicesDependency', v_services,
    'pricingResponses', COALESCE((SELECT jsonb_object_agg(customer_response, n) FROM
        (SELECT customer_response, count(*)::int n FROM public.sell_work_pricing_experiments GROUP BY 1) z), '{}'::jsonb),
    'revenue', (SELECT jsonb_build_object(
        'software', COALESCE(sum(amount) FILTER (WHERE revenue_group='SOFTWARE'),0),
        'sellWork', COALESCE(sum(amount) FILTER (WHERE revenue_group='SELL_WORK'),0),
        'services', COALESCE(sum(amount) FILTER (WHERE revenue_group='SERVICES'),0),
        'currencies', COALESCE(jsonb_agg(DISTINCT currency),'[]'::jsonb))
      FROM public.sell_work_revenue_records),
    'computedAt', now());
END; $$;

REVOKE EXECUTE ON FUNCTION public.swp2_assert_admin_read() FROM anon;
REVOKE EXECUTE ON FUNCTION public.swp2_assert_admin_write() FROM anon;
REVOKE EXECUTE ON FUNCTION public.compute_sell_work_pilot_metrics(uuid, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.compute_sell_work_pilot_portfolio(timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_sell_work_pilot(uuid, text, text, date, date, uuid, jsonb, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_sell_work_pilot_status(uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_sell_work_pilot_wtp(uuid, text, numeric, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_sell_work_paid_pilot(uuid, text, numeric, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_sell_work_pricing_experiment(uuid, text, integer, text, numeric, text, integer, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_sell_work_pricing_response(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_sell_work_pilot_support(uuid, text, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_sell_work_pilot_product(uuid, text, integer, text, text, text, text, text, text, text, boolean) FROM anon;
