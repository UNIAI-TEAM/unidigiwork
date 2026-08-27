CREATE OR REPLACE FUNCTION public.work_product_contract_payload(_r public.work_units)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
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