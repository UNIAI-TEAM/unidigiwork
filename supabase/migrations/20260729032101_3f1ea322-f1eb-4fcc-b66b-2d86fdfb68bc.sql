
-- =====================================================================
-- Batch 1D-OBS: check_quota observability
-- =====================================================================

CREATE TABLE public.quota_check_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  meter_key    text NOT NULL,
  quota_limit  bigint,
  current_usage bigint NOT NULL,
  requested_delta bigint NOT NULL,
  allowed      boolean NOT NULL,
  reason       text NOT NULL, -- 'allowed' | 'exceeded' | 'disabled' | 'no_entitlement' | 'unlimited'
  actor_id     uuid,
  correlation_id text,
  occurred_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX quota_check_events_tenant_meter_time_idx
  ON public.quota_check_events (tenant_id, meter_key, occurred_at DESC);
CREATE INDEX quota_check_events_allowed_time_idx
  ON public.quota_check_events (allowed, occurred_at DESC);

-- Grants: system writes (SECURITY DEFINER inside check_quota); no direct writes.
GRANT SELECT ON public.quota_check_events TO authenticated;
GRANT ALL    ON public.quota_check_events TO service_role;

ALTER TABLE public.quota_check_events ENABLE ROW LEVEL SECURITY;

-- Tenant members read own tenant; global admins read all.
CREATE POLICY quota_check_events_read_own_tenant
  ON public.quota_check_events FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id) OR public.has_role(auth.uid(),'admin'));

-- Immutability: block writes/updates/deletes from any client role.
CREATE POLICY quota_check_events_no_insert
  ON public.quota_check_events FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY quota_check_events_no_update
  ON public.quota_check_events FOR UPDATE TO authenticated USING (false);
CREATE POLICY quota_check_events_no_delete
  ON public.quota_check_events FOR DELETE TO authenticated USING (false);

-- =====================================================================
-- Rewrite check_quota to VOLATILE + inline log write.
-- Signature unchanged so all callers keep working.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.check_quota(
  _tenant_id uuid, _meter_key text, _delta bigint DEFAULT 1
) RETURNS boolean
  LANGUAGE plpgsql
  VOLATILE SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  _enabled BOOLEAN;
  _limit   BIGINT;
  _current BIGINT;
  _allowed BOOLEAN;
  _reason  TEXT;
  _corr    TEXT;
BEGIN
  SELECT enabled, quota_limit INTO _enabled, _limit
    FROM public.entitlements
    WHERE tenant_id = _tenant_id AND feature_key = _meter_key;

  IF NOT FOUND THEN
    _allowed := FALSE; _reason := 'no_entitlement'; _current := 0;
  ELSIF NOT _enabled THEN
    _allowed := FALSE; _reason := 'disabled'; _current := 0;
  ELSIF _limit IS NULL THEN
    _allowed := TRUE;  _reason := 'unlimited'; _current := 0;
  ELSE
    SELECT COALESCE(SUM(total),0) INTO _current
      FROM public.usage_counters
      WHERE tenant_id = _tenant_id AND meter_key = _meter_key
        AND period_start = date_trunc('month', now());
    IF (_current + _delta) <= _limit THEN
      _allowed := TRUE;  _reason := 'allowed';
    ELSE
      _allowed := FALSE; _reason := 'exceeded';
    END IF;
  END IF;

  -- Pull optional correlation id from GUC set by RPC callers when present.
  BEGIN
    _corr := NULLIF(current_setting('app.correlation_id', true), '');
  EXCEPTION WHEN OTHERS THEN
    _corr := NULL;
  END;

  INSERT INTO public.quota_check_events(
    tenant_id, meter_key, quota_limit, current_usage,
    requested_delta, allowed, reason, actor_id, correlation_id
  ) VALUES (
    _tenant_id, _meter_key, _limit, COALESCE(_current,0),
    _delta, _allowed, _reason, auth.uid(), _corr
  );

  RETURN _allowed;
END $function$;

-- =====================================================================
-- Aggregate view: last 24h PASS/FAIL per tenant + meter
-- =====================================================================
CREATE OR REPLACE VIEW public.v_quota_check_metrics
  WITH (security_invoker = true) AS
SELECT
  tenant_id,
  meter_key,
  count(*)                                              AS total_checks,
  count(*) FILTER (WHERE allowed)                       AS pass_count,
  count(*) FILTER (WHERE NOT allowed)                   AS fail_count,
  count(*) FILTER (WHERE reason='exceeded')             AS fail_exceeded,
  count(*) FILTER (WHERE reason='disabled')             AS fail_disabled,
  count(*) FILTER (WHERE reason='no_entitlement')       AS fail_no_entitlement,
  max(occurred_at)                                      AS last_check_at,
  max(occurred_at) FILTER (WHERE NOT allowed)           AS last_fail_at
FROM public.quota_check_events
WHERE occurred_at > now() - interval '24 hours'
GROUP BY tenant_id, meter_key;

GRANT SELECT ON public.v_quota_check_metrics TO authenticated;

COMMENT ON TABLE public.quota_check_events IS
  'Append-only log of every check_quota() call. Written by SECURITY DEFINER; RLS blocks all client writes.';
COMMENT ON VIEW  public.v_quota_check_metrics IS
  '24h rolling aggregation of quota checks per tenant/meter for dashboards.';
