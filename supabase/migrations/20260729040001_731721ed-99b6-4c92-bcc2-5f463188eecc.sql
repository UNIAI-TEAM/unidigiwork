
-- ============ quota_alert_rules ============
CREATE TABLE public.quota_alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE, -- NULL = global default
  meter_key text, -- NULL = all meters
  window_minutes int NOT NULL DEFAULT 5 CHECK (window_minutes BETWEEN 1 AND 1440),
  threshold_count int NOT NULL DEFAULT 5 CHECK (threshold_count >= 1),
  cooldown_minutes int NOT NULL DEFAULT 15 CHECK (cooldown_minutes >= 1),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX quota_alert_rules_uq
  ON public.quota_alert_rules (COALESCE(tenant_id::text,'*'), COALESCE(meter_key,'*'));

GRANT SELECT ON public.quota_alert_rules TO authenticated;
GRANT ALL ON public.quota_alert_rules TO service_role;
ALTER TABLE public.quota_alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quota_alert_rules_read_auth" ON public.quota_alert_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "quota_alert_rules_admin_write" ON public.quota_alert_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_quota_alert_rules_updated_at
  BEFORE UPDATE ON public.quota_alert_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ quota_alert_events ============
CREATE TABLE public.quota_alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  meter_key text NOT NULL,
  rule_id uuid REFERENCES public.quota_alert_rules(id) ON DELETE SET NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  exceeded_count int NOT NULL,
  threshold_count int NOT NULL,
  notified_user_ids uuid[] NOT NULL DEFAULT '{}',
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quota_alert_events_tenant_meter_time_idx
  ON public.quota_alert_events (tenant_id, meter_key, created_at DESC);

GRANT SELECT ON public.quota_alert_events TO authenticated;
GRANT ALL ON public.quota_alert_events TO service_role;
ALTER TABLE public.quota_alert_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quota_alert_events_admin_read" ON public.quota_alert_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "quota_alert_events_no_write" ON public.quota_alert_events
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- ============ evaluator + trigger ============
CREATE OR REPLACE FUNCTION public.evaluate_quota_alert(
  _tenant_id uuid,
  _meter_key text,
  _correlation_id text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule record;
  v_window_start timestamptz;
  v_now timestamptz := now();
  v_exceeded int;
  v_last_alert timestamptz;
  v_alert_id uuid;
  v_admin_ids uuid[];
  v_tenant_name text;
BEGIN
  -- pick most specific rule: (tenant,meter) > (tenant,*) > (*,meter) > (*,*)
  SELECT * INTO v_rule
  FROM public.quota_alert_rules
  WHERE enabled = true
    AND (tenant_id IS NULL OR tenant_id = _tenant_id)
    AND (meter_key IS NULL OR meter_key = _meter_key)
  ORDER BY (tenant_id IS NOT NULL) DESC, (meter_key IS NOT NULL) DESC
  LIMIT 1;

  IF v_rule IS NULL THEN RETURN; END IF;

  v_window_start := v_now - (v_rule.window_minutes || ' minutes')::interval;

  SELECT count(*)::int INTO v_exceeded
  FROM public.quota_check_events
  WHERE tenant_id = _tenant_id
    AND meter_key = _meter_key
    AND allowed = false
    AND reason = 'exceeded'
    AND occurred_at >= v_window_start;

  IF v_exceeded < v_rule.threshold_count THEN RETURN; END IF;

  -- cooldown check
  SELECT max(created_at) INTO v_last_alert
  FROM public.quota_alert_events
  WHERE tenant_id = _tenant_id AND meter_key = _meter_key;

  IF v_last_alert IS NOT NULL
     AND v_last_alert > v_now - (v_rule.cooldown_minutes || ' minutes')::interval THEN
    RETURN;
  END IF;

  -- collect admin recipients
  SELECT array_agg(DISTINCT user_id) INTO v_admin_ids
  FROM public.user_roles WHERE role = 'admin';
  v_admin_ids := COALESCE(v_admin_ids, '{}');

  SELECT name INTO v_tenant_name FROM public.tenants WHERE id = _tenant_id;

  INSERT INTO public.quota_alert_events(
    tenant_id, meter_key, rule_id, window_start, window_end,
    exceeded_count, threshold_count, notified_user_ids, correlation_id
  ) VALUES (
    _tenant_id, _meter_key, v_rule.id, v_window_start, v_now,
    v_exceeded, v_rule.threshold_count, v_admin_ids, _correlation_id
  ) RETURNING id INTO v_alert_id;

  -- fan-out notifications (platform scope so no tenant membership needed)
  INSERT INTO public.notifications(
    user_id, type, title, body, link, meta, scope_type, tenant_id
  )
  SELECT
    u,
    'quota_alert',
    format('Quota spike: %s (%s)', _meter_key, COALESCE(v_tenant_name,'tenant')),
    format('%s lần vượt hạn mức trong %s phút (ngưỡng %s).',
           v_exceeded, v_rule.window_minutes, v_rule.threshold_count),
    '/admin/quota',
    jsonb_build_object(
      'alert_id', v_alert_id,
      'tenant_id', _tenant_id,
      'meter_key', _meter_key,
      'exceeded_count', v_exceeded,
      'threshold_count', v_rule.threshold_count,
      'window_minutes', v_rule.window_minutes,
      'correlation_id', _correlation_id
    ),
    'platform',
    NULL
  FROM unnest(v_admin_ids) AS u;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_quota_alert(uuid, text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.tg_quota_check_events_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.allowed = false AND NEW.reason = 'exceeded' THEN
    PERFORM public.evaluate_quota_alert(NEW.tenant_id, NEW.meter_key, NEW.correlation_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_quota_check_events_alert
  AFTER INSERT ON public.quota_check_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_quota_check_events_alert();

-- ============ default rule ============
INSERT INTO public.quota_alert_rules(tenant_id, meter_key, window_minutes, threshold_count, cooldown_minutes, enabled)
VALUES (NULL, NULL, 5, 5, 15, true);

-- ============ realtime ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.quota_alert_events;
