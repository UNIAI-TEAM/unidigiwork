
-- =========================================================================
-- Batch 1C-DB · Subscription · Entitlement · Quota (Blueprint §18)
-- =========================================================================

-- Extensions already available (gen_random_uuid).

-- ---------- 1. plans (global catalog) ----------
CREATE TABLE public.plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INT NOT NULL DEFAULT 0,
  row_version BIGINT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX plans_only_one_default ON public.plans(is_default) WHERE is_default;
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT ALL   ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY plans_read_all ON public.plans FOR SELECT USING (is_active OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER plans_bump BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

-- ---------- 2. features (global catalog) ----------
CREATE TABLE public.features (
  key        TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('flag','quota')),
  unit       TEXT,
  category   TEXT NOT NULL DEFAULT 'general',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.features TO anon, authenticated;
GRANT ALL   ON public.features TO service_role;
ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;
CREATE POLICY features_read_all ON public.features FOR SELECT USING (TRUE);

-- ---------- 3. plan_features ----------
CREATE TABLE public.plan_features (
  plan_id     UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL REFERENCES public.features(key) ON DELETE RESTRICT,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  quota_limit BIGINT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, feature_key)
);
GRANT SELECT ON public.plan_features TO anon, authenticated;
GRANT ALL   ON public.plan_features TO service_role;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY plan_features_read_all ON public.plan_features FOR SELECT USING (TRUE);

-- ---------- 4. subscriptions (tenant-scoped) ----------
CREATE TABLE public.subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id           UUID NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status            TEXT NOT NULL CHECK (status IN ('active','trialing','past_due','suspended','canceled')),
  period_start      TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_end        TIMESTAMPTZ,
  cancel_at         TIMESTAMPTZ,
  canceled_at       TIMESTAMPTZ,
  provider          TEXT NOT NULL DEFAULT 'lovable_internal',
  provider_ref      TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_version       BIGINT NOT NULL DEFAULT 1,
  created_by        UUID,
  updated_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Only one non-canceled subscription per tenant.
CREATE UNIQUE INDEX subscriptions_tenant_active_uidx
  ON public.subscriptions(tenant_id) WHERE status <> 'canceled';
CREATE INDEX subscriptions_tenant_idx ON public.subscriptions(tenant_id);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL    ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_read_tenant ON public.subscriptions FOR SELECT
  TO authenticated USING (public.is_tenant_member(tenant_id));
-- No direct INSERT/UPDATE/DELETE — mutate only via SECURITY DEFINER RPC.
CREATE TRIGGER subscriptions_bump BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

-- Validate period trigger (avoid time-dependent CHECK).
CREATE OR REPLACE FUNCTION public.tg_subscriptions_validate()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.period_end IS NOT NULL AND NEW.period_end <= NEW.period_start THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: period_end must be > period_start' USING ERRCODE = '22000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER subscriptions_validate BEFORE INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_subscriptions_validate();

-- ---------- 5. entitlements (tenant-scoped cache) ----------
CREATE TABLE public.entitlements (
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL REFERENCES public.features(key) ON DELETE CASCADE,
  enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  quota_limit BIGINT,
  source      TEXT NOT NULL DEFAULT 'plan',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, feature_key)
);
GRANT SELECT ON public.entitlements TO authenticated;
GRANT ALL    ON public.entitlements TO service_role;
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY entitlements_read_tenant ON public.entitlements FOR SELECT
  TO authenticated USING (public.is_tenant_member(tenant_id));

-- ---------- 6. usage_events (append-only) ----------
CREATE TABLE public.usage_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  meter_key       TEXT NOT NULL REFERENCES public.features(key) ON DELETE RESTRICT,
  quantity        BIGINT NOT NULL,
  actor_id        UUID,
  workspace_id    UUID,
  correlation_id  TEXT,
  idempotency_key TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX usage_events_tenant_meter_time_idx
  ON public.usage_events(tenant_id, meter_key, occurred_at DESC);
CREATE UNIQUE INDEX usage_events_idem_uidx
  ON public.usage_events(tenant_id, meter_key, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
GRANT SELECT ON public.usage_events TO authenticated;
GRANT ALL    ON public.usage_events TO service_role;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY usage_events_read_admin ON public.usage_events FOR SELECT
  TO authenticated USING (
    public.has_tenant_role(tenant_id,'tenant_owner')
    OR public.has_tenant_role(tenant_id,'tenant_admin')
    OR public.has_role(auth.uid(),'admin')
  );

CREATE OR REPLACE FUNCTION public.tg_usage_events_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'usage_events is append-only (op=%)', TG_OP USING ERRCODE = 'restrict_violation';
END $$;
CREATE TRIGGER usage_events_no_update BEFORE UPDATE ON public.usage_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_usage_events_immutable();
CREATE TRIGGER usage_events_no_delete BEFORE DELETE ON public.usage_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_usage_events_immutable();

-- ---------- 7. usage_counters ----------
CREATE TABLE public.usage_counters (
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  meter_key     TEXT NOT NULL REFERENCES public.features(key) ON DELETE RESTRICT,
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ,
  total         BIGINT NOT NULL DEFAULT 0,
  row_version   BIGINT NOT NULL DEFAULT 1,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, meter_key, period_start)
);
GRANT SELECT ON public.usage_counters TO authenticated;
GRANT ALL    ON public.usage_counters TO service_role;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY usage_counters_read_tenant ON public.usage_counters FOR SELECT
  TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE TRIGGER usage_counters_bump BEFORE UPDATE ON public.usage_counters
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

-- =========================================================================
-- Seed catalog: features
-- =========================================================================
INSERT INTO public.features(key, name, kind, unit, category, sort_order) VALUES
  ('member.count',           'Số thành viên',              'quota', 'seats',    'seats',   10),
  ('workspace.count',        'Số workspace',               'quota', 'items',    'seats',   20),
  ('storage.bytes',          'Dung lượng lưu trữ',         'quota', 'bytes',    'storage', 30),
  ('meeting.minutes',        'Phút họp',                    'quota', 'minutes',  'meeting', 40),
  ('meeting.recording',      'Ghi hình cuộc họp',          'flag',  NULL,       'meeting', 41),
  ('ai.tokens',              'AI tokens',                   'quota', 'tokens',   'ai',      50),
  ('ai.transcription.min',   'AI transcription (phút)',    'quota', 'minutes',  'ai',      51),
  ('workflow.runs',          'Workflow runs / kỳ',         'quota', 'runs',     'workflow',60),
  ('api.requests',           'API requests / kỳ',          'quota', 'requests', 'api',     70),
  ('sso.saml',               'SSO SAML',                    'flag',  NULL,       'security',80),
  ('audit.export',           'Export audit log',           'flag',  NULL,       'security',81);

-- =========================================================================
-- Seed plans + plan_features
-- =========================================================================
INSERT INTO public.plans(code, name, description, is_default, sort_order) VALUES
  ('free',     'Free',     'Gói miễn phí cho nhóm nhỏ',            TRUE,  10),
  ('pro',      'Pro',      'Gói chuyên nghiệp cho team đang lớn',  FALSE, 20),
  ('business', 'Business', 'Gói doanh nghiệp đầy đủ tính năng',    FALSE, 30);

-- free
INSERT INTO public.plan_features(plan_id, feature_key, enabled, quota_limit)
SELECT p.id, f.feature_key, f.enabled, f.quota_limit
FROM public.plans p, (VALUES
  ('member.count',         TRUE,  5::BIGINT),
  ('workspace.count',      TRUE,  2::BIGINT),
  ('storage.bytes',        TRUE,  1073741824::BIGINT),
  ('meeting.minutes',      TRUE,  300::BIGINT),
  ('meeting.recording',    FALSE, NULL::BIGINT),
  ('ai.tokens',            TRUE,  50000::BIGINT),
  ('ai.transcription.min', TRUE,  30::BIGINT),
  ('workflow.runs',        TRUE,  100::BIGINT),
  ('api.requests',         TRUE,  10000::BIGINT),
  ('sso.saml',             FALSE, NULL::BIGINT),
  ('audit.export',         FALSE, NULL::BIGINT)
) AS f(feature_key, enabled, quota_limit)
WHERE p.code = 'free';

-- pro
INSERT INTO public.plan_features(plan_id, feature_key, enabled, quota_limit)
SELECT p.id, f.feature_key, f.enabled, f.quota_limit
FROM public.plans p, (VALUES
  ('member.count',         TRUE,  25::BIGINT),
  ('workspace.count',      TRUE,  10::BIGINT),
  ('storage.bytes',        TRUE,  21474836480::BIGINT),
  ('meeting.minutes',      TRUE,  3000::BIGINT),
  ('meeting.recording',    TRUE,  NULL::BIGINT),
  ('ai.tokens',            TRUE,  1000000::BIGINT),
  ('ai.transcription.min', TRUE,  600::BIGINT),
  ('workflow.runs',        TRUE,  5000::BIGINT),
  ('api.requests',         TRUE,  500000::BIGINT),
  ('sso.saml',             FALSE, NULL::BIGINT),
  ('audit.export',         TRUE,  NULL::BIGINT)
) AS f(feature_key, enabled, quota_limit)
WHERE p.code = 'pro';

-- business
INSERT INTO public.plan_features(plan_id, feature_key, enabled, quota_limit)
SELECT p.id, f.feature_key, f.enabled, f.quota_limit
FROM public.plans p, (VALUES
  ('member.count',         TRUE,  100::BIGINT),
  ('workspace.count',      TRUE,  NULL::BIGINT),
  ('storage.bytes',        TRUE,  214748364800::BIGINT),
  ('meeting.minutes',      TRUE,  NULL::BIGINT),
  ('meeting.recording',    TRUE,  NULL::BIGINT),
  ('ai.tokens',            TRUE,  10000000::BIGINT),
  ('ai.transcription.min', TRUE,  6000::BIGINT),
  ('workflow.runs',        TRUE,  NULL::BIGINT),
  ('api.requests',         TRUE,  NULL::BIGINT),
  ('sso.saml',             TRUE,  NULL::BIGINT),
  ('audit.export',         TRUE,  NULL::BIGINT)
) AS f(feature_key, enabled, quota_limit)
WHERE p.code = 'business';

-- =========================================================================
-- Core RPCs
-- =========================================================================

-- refresh_entitlements: rebuild cache for a tenant from its active subscription.
CREATE OR REPLACE FUNCTION public.refresh_entitlements(_tenant_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _plan UUID;
BEGIN
  SELECT plan_id INTO _plan FROM public.subscriptions
    WHERE tenant_id = _tenant_id AND status IN ('active','trialing','past_due')
    ORDER BY created_at DESC LIMIT 1;

  DELETE FROM public.entitlements WHERE tenant_id = _tenant_id;

  IF _plan IS NULL THEN RETURN; END IF;

  INSERT INTO public.entitlements(tenant_id, feature_key, enabled, quota_limit, source)
  SELECT _tenant_id, pf.feature_key, pf.enabled, pf.quota_limit, 'plan'
  FROM public.plan_features pf WHERE pf.plan_id = _plan;
END $$;

-- provision_default_subscription: create free subscription for a new tenant (called from provision_tenant).
CREATE OR REPLACE FUNCTION public.provision_default_subscription(_tenant_id UUID, _actor UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _plan UUID; _sub UUID;
BEGIN
  SELECT id INTO _plan FROM public.plans WHERE is_default = TRUE AND is_active = TRUE LIMIT 1;
  IF _plan IS NULL THEN
    RAISE EXCEPTION 'PLAN_NOT_FOUND: no default plan configured' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.subscriptions(tenant_id, plan_id, status, period_start, provider, created_by, updated_by)
  VALUES (_tenant_id, _plan, 'active', now(), 'lovable_internal', _actor, _actor)
  ON CONFLICT (tenant_id) WHERE status <> 'canceled' DO NOTHING
  RETURNING id INTO _sub;

  IF _sub IS NULL THEN
    SELECT id INTO _sub FROM public.subscriptions
      WHERE tenant_id = _tenant_id AND status <> 'canceled' LIMIT 1;
  END IF;

  PERFORM public.refresh_entitlements(_tenant_id);

  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload)
  VALUES (_tenant_id, _actor, 'subscription.activated', 'subscription', _sub::text,
          jsonb_build_object('plan_id', _plan, 'source', 'auto_default'));
  INSERT INTO public.outbox_events(tenant_id, event_type, event_version, aggregate_type, aggregate_id, payload)
  VALUES (_tenant_id, 'subscription.activated.v1', 1, 'subscription', _sub::text,
          jsonb_build_object('tenant_id', _tenant_id, 'plan_id', _plan));

  RETURN _sub;
END $$;

-- change_subscription: admin path (tenant_owner or app admin).
CREATE OR REPLACE FUNCTION public.change_subscription(
  _tenant_id UUID, _plan_code TEXT,
  _idempotency_key TEXT DEFAULT NULL, _correlation_id TEXT DEFAULT NULL,
  _expected_row_version BIGINT DEFAULT NULL
) RETURNS public.subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor UUID := auth.uid();
  _new_plan UUID;
  _old public.subscriptions;
  _row public.subscriptions;
  _existing UUID;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000'; END IF;
  IF NOT (public.has_tenant_role(_tenant_id,'tenant_owner') OR public.has_role(_actor,'admin')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO _new_plan FROM public.plans WHERE code = _plan_code AND is_active = TRUE;
  IF _new_plan IS NULL THEN
    RAISE EXCEPTION 'PLAN_NOT_FOUND: %', _plan_code USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency dedup via audit log.
  IF _idempotency_key IS NOT NULL THEN
    SELECT (payload->>'subscription_id')::uuid INTO _existing
      FROM public.audit_events
      WHERE event_type = 'subscription.changed' AND idempotency_key = _idempotency_key
      LIMIT 1;
    IF _existing IS NOT NULL THEN
      SELECT * INTO _row FROM public.subscriptions WHERE id = _existing;
      RETURN _row;
    END IF;
  END IF;

  SELECT * INTO _old FROM public.subscriptions
    WHERE tenant_id = _tenant_id AND status <> 'canceled' FOR UPDATE;

  IF _old.id IS NULL THEN
    INSERT INTO public.subscriptions(tenant_id, plan_id, status, provider, created_by, updated_by)
    VALUES (_tenant_id, _new_plan, 'active', 'lovable_internal', _actor, _actor)
    RETURNING * INTO _row;
  ELSE
    IF _expected_row_version IS NOT NULL AND _old.row_version <> _expected_row_version THEN
      RAISE EXCEPTION 'VERSION_CONFLICT' USING ERRCODE = '40001';
    END IF;
    IF _old.plan_id = _new_plan THEN
      RETURN _old;
    END IF;
    UPDATE public.subscriptions
      SET plan_id = _new_plan, updated_by = _actor
      WHERE id = _old.id
      RETURNING * INTO _row;
  END IF;

  PERFORM public.refresh_entitlements(_tenant_id);

  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, idempotency_key, correlation_id)
  VALUES (_tenant_id, _actor, 'subscription.changed', 'subscription', _row.id::text,
          jsonb_build_object('subscription_id', _row.id, 'from_plan', _old.plan_id, 'to_plan', _new_plan, 'plan_code', _plan_code),
          _idempotency_key, _correlation_id);

  INSERT INTO public.outbox_events(tenant_id, event_type, event_version, aggregate_type, aggregate_id, payload, correlation_id, idempotency_key)
  VALUES (_tenant_id, 'subscription.changed.v1', 1, 'subscription', _row.id::text,
          jsonb_build_object('tenant_id', _tenant_id, 'from_plan', _old.plan_id, 'to_plan', _new_plan, 'plan_code', _plan_code),
          _correlation_id, _idempotency_key);

  RETURN _row;
END $$;

-- record_usage: append usage_event and upsert usage_counter atomically.
CREATE OR REPLACE FUNCTION public.record_usage(
  _tenant_id UUID, _meter_key TEXT, _quantity BIGINT,
  _idempotency_key TEXT DEFAULT NULL, _correlation_id TEXT DEFAULT NULL,
  _workspace_id UUID DEFAULT NULL, _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor UUID := auth.uid();
  _event_id UUID;
  _period_start TIMESTAMPTZ := date_trunc('month', now());
  _limit BIGINT;
  _new_total BIGINT;
BEGIN
  IF _quantity <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: quantity must be positive' USING ERRCODE = '22000';
  END IF;

  -- Idempotency short-circuit.
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO _event_id FROM public.usage_events
      WHERE tenant_id = _tenant_id AND meter_key = _meter_key AND idempotency_key = _idempotency_key
      LIMIT 1;
    IF _event_id IS NOT NULL THEN RETURN _event_id; END IF;
  END IF;

  INSERT INTO public.usage_events(tenant_id, meter_key, quantity, actor_id, workspace_id, correlation_id, idempotency_key, metadata)
  VALUES (_tenant_id, _meter_key, _quantity, _actor, _workspace_id, _correlation_id, _idempotency_key, COALESCE(_metadata,'{}'::jsonb))
  RETURNING id INTO _event_id;

  INSERT INTO public.usage_counters(tenant_id, meter_key, period_start, period_end, total)
  VALUES (_tenant_id, _meter_key, _period_start, _period_start + INTERVAL '1 month', _quantity)
  ON CONFLICT (tenant_id, meter_key, period_start)
  DO UPDATE SET total = public.usage_counters.total + EXCLUDED.total,
                row_version = public.usage_counters.row_version + 1,
                updated_at = now()
  RETURNING total INTO _new_total;

  SELECT quota_limit INTO _limit FROM public.entitlements
    WHERE tenant_id = _tenant_id AND feature_key = _meter_key;

  IF _limit IS NOT NULL AND _new_total > _limit THEN
    INSERT INTO public.outbox_events(tenant_id, event_type, event_version, aggregate_type, aggregate_id, payload, correlation_id)
    VALUES (_tenant_id, 'quota.exceeded.v1', 1, 'usage_counter',
            _tenant_id::text || ':' || _meter_key,
            jsonb_build_object('tenant_id', _tenant_id, 'meter_key', _meter_key, 'total', _new_total, 'quota_limit', _limit),
            _correlation_id);
  END IF;

  RETURN _event_id;
END $$;

-- check_quota: returns true if (current_usage + delta) <= limit (or limit is NULL / feature disabled).
CREATE OR REPLACE FUNCTION public.check_quota(_tenant_id UUID, _meter_key TEXT, _delta BIGINT DEFAULT 1)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _enabled BOOLEAN; _limit BIGINT; _current BIGINT;
BEGIN
  SELECT enabled, quota_limit INTO _enabled, _limit
    FROM public.entitlements
    WHERE tenant_id = _tenant_id AND feature_key = _meter_key;
  IF NOT FOUND OR NOT _enabled THEN RETURN FALSE; END IF;
  IF _limit IS NULL THEN RETURN TRUE; END IF;
  SELECT COALESCE(SUM(total),0) INTO _current
    FROM public.usage_counters
    WHERE tenant_id = _tenant_id AND meter_key = _meter_key
      AND period_start = date_trunc('month', now());
  RETURN (_current + _delta) <= _limit;
END $$;

-- =========================================================================
-- Wire billing into existing lifecycle
-- =========================================================================

-- Extend provision_tenant to auto-provision default subscription.
-- NOTE: reuses existing function shape from Batch 1B.
CREATE OR REPLACE FUNCTION public.provision_tenant(
  _name text, _slug text, _owner_id uuid, _default_workspace_name text,
  _idempotency_key text DEFAULT NULL::text, _correlation_id text DEFAULT NULL::text
) RETURNS TABLE(tenant_id uuid, workspace_id uuid, membership_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tenant_id UUID; _workspace_id UUID; _member_id UUID;
  _actor UUID := auth.uid();
  _existing_tenant UUID; _existing_fp TEXT; _fp TEXT;
  _norm_slug TEXT := regexp_replace(lower(coalesce(_slug,'')), '[^a-z0-9-]+', '-', 'g');
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000'; END IF;
  IF _actor <> _owner_id AND NOT public.has_role(_actor, 'admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF length(_norm_slug) < 3 OR length(_norm_slug) > 63 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: slug length' USING ERRCODE = '22000';
  END IF;
  IF public.is_reserved_slug(_norm_slug) THEN
    RAISE EXCEPTION 'TENANT_SLUG_CONFLICT: reserved' USING ERRCODE = '23505';
  END IF;

  _fp := md5(coalesce(_name,'') || '|' || _norm_slug || '|' || _owner_id::text || '|' || coalesce(_default_workspace_name,''));

  IF _idempotency_key IS NOT NULL THEN
    SELECT (payload->>'tenant_id')::uuid, payload->>'fingerprint'
      INTO _existing_tenant, _existing_fp
      FROM public.audit_events
      WHERE event_type = 'tenant.provisioned' AND idempotency_key = _idempotency_key
      LIMIT 1;
    IF _existing_tenant IS NOT NULL THEN
      IF _existing_fp IS NOT NULL AND _existing_fp <> _fp THEN
        RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
      END IF;
      RETURN QUERY
        SELECT _existing_tenant, w.id, tm.id
        FROM public.workspaces w
        JOIN public.tenant_members tm ON tm.tenant_id = _existing_tenant AND tm.role = 'tenant_owner'
        WHERE w.tenant_id = _existing_tenant
        ORDER BY w.created_at ASC LIMIT 1;
      RETURN;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = _norm_slug) THEN
    RAISE EXCEPTION 'TENANT_SLUG_CONFLICT' USING ERRCODE = '23505';
  END IF;

  _tenant_id := gen_random_uuid();
  _workspace_id := _tenant_id;

  INSERT INTO public.tenants(id, slug, name, status, created_by, updated_by)
  VALUES (_tenant_id, _norm_slug, _name, 'active', _owner_id, _owner_id);

  INSERT INTO public.tenant_members(tenant_id, user_id, role, status, created_by, updated_by)
  VALUES (_tenant_id, _owner_id, 'tenant_owner', 'active', _owner_id, _owner_id)
  RETURNING id INTO _member_id;

  INSERT INTO public.workspaces(id, name, owner_id, tenant_id, updated_by)
  VALUES (_workspace_id, _default_workspace_name, _owner_id, _tenant_id, _owner_id);

  -- Auto-provision default subscription (Batch 1C).
  PERFORM public.provision_default_subscription(_tenant_id, _owner_id);

  -- Seed initial usage: 1 member, 1 workspace.
  PERFORM public.record_usage(_tenant_id, 'member.count', 1, NULL, _correlation_id);
  PERFORM public.record_usage(_tenant_id, 'workspace.count', 1, NULL, _correlation_id);

  BEGIN
    INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, idempotency_key, correlation_id)
    VALUES
      (_tenant_id, _actor, 'tenant.provisioned', 'tenant', _tenant_id::text,
       jsonb_build_object('tenant_id', _tenant_id, 'workspace_id', _workspace_id, 'owner_id', _owner_id, 'slug', _norm_slug, 'fingerprint', _fp),
       _idempotency_key, _correlation_id);
  EXCEPTION WHEN unique_violation THEN
    SELECT (payload->>'tenant_id')::uuid INTO _existing_tenant
      FROM public.audit_events
      WHERE event_type = 'tenant.provisioned' AND idempotency_key = _idempotency_key
      LIMIT 1;
    IF _existing_tenant IS NULL THEN RAISE; END IF;
    RAISE EXCEPTION 'IDEMPOTENCY_REPLAY_RACE' USING ERRCODE = '40001';
  END;

  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES
    (_tenant_id, _actor, 'tenant.member_added', 'tenant_member', _member_id::text,
     jsonb_build_object('tenant_id', _tenant_id, 'user_id', _owner_id, 'role', 'tenant_owner'), _correlation_id),
    (_tenant_id, _actor, 'workspace.created', 'workspace', _workspace_id::text,
     jsonb_build_object('workspace_id', _workspace_id, 'tenant_id', _tenant_id, 'name', _default_workspace_name), _correlation_id);

  INSERT INTO public.outbox_events(tenant_id, event_type, event_version, aggregate_type, aggregate_id, payload, correlation_id, idempotency_key)
  VALUES
    (_tenant_id, 'tenant.created.v1', 1, 'tenant', _tenant_id::text,
     jsonb_build_object('tenant_id', _tenant_id, 'slug', _norm_slug, 'name', _name), _correlation_id, _idempotency_key),
    (_tenant_id, 'tenant.member_added.v1', 1, 'tenant_member', _member_id::text,
     jsonb_build_object('tenant_id', _tenant_id, 'user_id', _owner_id, 'role', 'tenant_owner'), _correlation_id, NULL),
    (_tenant_id, 'workspace.created.v1', 1, 'workspace', _workspace_id::text,
     jsonb_build_object('workspace_id', _workspace_id, 'tenant_id', _tenant_id, 'name', _default_workspace_name), _correlation_id, NULL);

  RETURN QUERY SELECT _tenant_id, _workspace_id, _member_id;
END $$;

-- Backfill: create subscriptions for existing tenants without one.
DO $$
DECLARE _t RECORD;
BEGIN
  FOR _t IN
    SELECT t.id, t.created_by
    FROM public.tenants t
    LEFT JOIN public.subscriptions s ON s.tenant_id = t.id AND s.status <> 'canceled'
    WHERE s.id IS NULL
  LOOP
    PERFORM public.provision_default_subscription(_t.id, _t.created_by);
  END LOOP;
END $$;
