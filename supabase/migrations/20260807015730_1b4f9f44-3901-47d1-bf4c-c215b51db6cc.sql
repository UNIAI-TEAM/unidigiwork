CREATE OR REPLACE FUNCTION public.cancel_subscription(
  _tenant_id uuid,
  _immediate boolean DEFAULT false,
  _idempotency_key text DEFAULT NULL,
  _correlation_id text DEFAULT NULL,
  _expected_row_version bigint DEFAULT NULL
) RETURNS public.subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _old public.subscriptions;
  _row public.subscriptions;
  _default_plan uuid;
  _existing uuid;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000'; END IF;
  IF NOT (public.has_tenant_role(_tenant_id,'tenant_owner') OR public.has_role(_actor,'admin')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  IF _idempotency_key IS NOT NULL THEN
    SELECT (payload->>'subscription_id')::uuid INTO _existing
      FROM public.audit_events
      WHERE event_type = 'subscription.canceled' AND idempotency_key = _idempotency_key
      LIMIT 1;
    IF _existing IS NOT NULL THEN
      SELECT * INTO _row FROM public.subscriptions WHERE id = _existing;
      RETURN _row;
    END IF;
  END IF;

  SELECT * INTO _old FROM public.subscriptions
    WHERE tenant_id = _tenant_id AND status <> 'canceled' FOR UPDATE;
  IF _old.id IS NULL THEN
    RAISE EXCEPTION 'SUBSCRIPTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF _expected_row_version IS NOT NULL AND _old.row_version <> _expected_row_version THEN
    RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = '40001';
  END IF;

  SELECT id INTO _default_plan FROM public.plans WHERE is_default = TRUE AND is_active = TRUE LIMIT 1;
  IF _default_plan IS NULL THEN
    RAISE EXCEPTION 'PLAN_NOT_FOUND: default' USING ERRCODE = 'P0002';
  END IF;

  IF _immediate THEN
    UPDATE public.subscriptions
      SET plan_id = _default_plan,
          cancel_at = NULL,
          canceled_at = now(),
          period_start = now(),
          period_end = NULL,
          updated_by = _actor
      WHERE id = _old.id
      RETURNING * INTO _row;
  ELSE
    UPDATE public.subscriptions
      SET cancel_at = COALESCE(_old.period_end, now() + interval '30 days'),
          updated_by = _actor
      WHERE id = _old.id
      RETURNING * INTO _row;
  END IF;

  PERFORM public.refresh_entitlements(_tenant_id);

  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, idempotency_key, correlation_id)
  VALUES (_tenant_id, _actor, 'subscription.canceled', 'subscription', _row.id::text,
          jsonb_build_object('subscription_id', _row.id, 'immediate', _immediate, 'cancel_at', _row.cancel_at),
          _idempotency_key, _correlation_id);

  INSERT INTO public.outbox_events(tenant_id, event_type, event_version, aggregate_type, aggregate_id, payload, correlation_id, idempotency_key)
  VALUES (_tenant_id, 'subscription.canceled.v1', 1, 'subscription', _row.id::text,
          jsonb_build_object('tenant_id', _tenant_id, 'immediate', _immediate, 'cancel_at', _row.cancel_at),
          _correlation_id, _idempotency_key);

  RETURN _row;
END $function$;

CREATE OR REPLACE FUNCTION public.resume_subscription(
  _tenant_id uuid,
  _correlation_id text DEFAULT NULL
) RETURNS public.subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _row public.subscriptions;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000'; END IF;
  IF NOT (public.has_tenant_role(_tenant_id,'tenant_owner') OR public.has_role(_actor,'admin')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.subscriptions
    SET cancel_at = NULL, updated_by = _actor
    WHERE tenant_id = _tenant_id AND status <> 'canceled'
    RETURNING * INTO _row;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'SUBSCRIPTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (_tenant_id, _actor, 'subscription.resumed', 'subscription', _row.id::text,
          jsonb_build_object('subscription_id', _row.id), _correlation_id);

  RETURN _row;
END $function$;

REVOKE ALL ON FUNCTION public.cancel_subscription(uuid, boolean, text, text, bigint) FROM public, anon;
REVOKE ALL ON FUNCTION public.resume_subscription(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cancel_subscription(uuid, boolean, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_subscription(uuid, text) TO authenticated;