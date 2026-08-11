CREATE OR REPLACE FUNCTION public.record_usage(
  _tenant_id uuid, _meter_key text, _quantity bigint,
  _idempotency_key text DEFAULT NULL::text, _correlation_id text DEFAULT NULL::text,
  _workspace_id uuid DEFAULT NULL::uuid, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _actor uuid := auth.uid(); _period_start timestamptz; _event_id uuid;
BEGIN
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: tenant is required' USING ERRCODE = '22000';
  END IF;
  IF _meter_key IS NULL OR length(btrim(_meter_key)) = 0 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: meter_key is required' USING ERRCODE = '22000';
  END IF;
  IF _quantity IS NULL OR _quantity = 0 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: quantity must be non-zero' USING ERRCODE = '22000';
  END IF;

  _period_start := date_trunc('month', now());

  INSERT INTO public.usage_events(tenant_id, meter_key, quantity, actor_id, workspace_id, correlation_id, idempotency_key, metadata)
  VALUES (_tenant_id, _meter_key, _quantity, _actor, _workspace_id, _correlation_id, _idempotency_key, COALESCE(_metadata,'{}'::jsonb))
  ON CONFLICT DO NOTHING
  RETURNING id INTO _event_id;

  IF _event_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.usage_counters(tenant_id, meter_key, period_start, period_end, total)
  VALUES (_tenant_id, _meter_key, _period_start, _period_start + INTERVAL '1 month', GREATEST(_quantity, 0))
  ON CONFLICT (tenant_id, meter_key, period_start)
  DO UPDATE SET total = GREATEST(public.usage_counters.total + _quantity, 0),
                updated_at = now();

  RETURN _event_id;
END $function$;