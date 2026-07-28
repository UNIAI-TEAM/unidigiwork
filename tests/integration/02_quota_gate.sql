-- ==========================================================================
-- Integration test: Quota gate (Batch 1D-API)
-- Verifies check_quota + record_usage stop creation when the tenant's
-- entitlement limit is reached, and that usage_counters increments per call.
-- ==========================================================================
\ir _helpers.sql

BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :OWNER_A, 'role','authenticated')::text, true);

CREATE TEMP TABLE _t AS
SELECT * FROM public.provision_tenant(
  'itest_quota', 'itest-quota-'||substr(md5(random()::text),1,10),
  :OWNER_A::uuid, 'WS-Q');

-- entitlement: tasks.active limit = 2
INSERT INTO public.entitlements(tenant_id, feature_key, enabled, quota_limit, source)
SELECT tenant_id, 'tasks.active', true, 2, 'test' FROM _t
ON CONFLICT (tenant_id, feature_key)
DO UPDATE SET enabled=true, quota_limit=2;

-- ---- assertion 1: first two create_task calls succeed ----------------------
DO $$
DECLARE _ws uuid; _id uuid;
BEGIN
  SELECT workspace_id INTO _ws FROM _t;
  _id := (public.create_task(_ws, 't1', NULL, 'normal', NULL, NULL, 'q-1', NULL)).id;
  IF _id IS NULL THEN RAISE EXCEPTION 'FAIL quota: task 1 not created'; END IF;
  _id := (public.create_task(_ws, 't2', NULL, 'normal', NULL, NULL, 'q-2', NULL)).id;
  IF _id IS NULL THEN RAISE EXCEPTION 'FAIL quota: task 2 not created'; END IF;
  RAISE NOTICE 'OK quota: 2/2 tasks created within limit';
END $$;

-- ---- assertion 2: usage_counters reflects both increments ------------------
DO $$
DECLARE _total bigint;
BEGIN
  SELECT COALESCE(SUM(total),0) INTO _total
    FROM public.usage_counters
   WHERE tenant_id = (SELECT tenant_id FROM _t)
     AND meter_key = 'tasks.active'
     AND period_start = date_trunc('month', now());
  IF _total <> 2 THEN
    RAISE EXCEPTION 'FAIL quota-usage: usage_counters.total = % (expected 2)', _total;
  END IF;
  RAISE NOTICE 'OK quota-usage: usage_counters incremented to 2';
END $$;

-- ---- assertion 3: third task must raise QUOTA_EXCEEDED ---------------------
DO $$
DECLARE _ws uuid; _err text;
BEGIN
  SELECT workspace_id INTO _ws FROM _t;
  BEGIN
    PERFORM public.create_task(_ws, 't3', NULL, 'normal', NULL, NULL, 'q-3', NULL);
    RAISE EXCEPTION 'FAIL quota-gate: 3rd task created despite limit=2';
  EXCEPTION WHEN OTHERS THEN
    _err := SQLERRM;
    IF _err !~* 'quota' THEN
      RAISE EXCEPTION 'FAIL quota-gate: unexpected error %', _err;
    END IF;
    RAISE NOTICE 'OK quota-gate: 3rd task rejected (%).', _err;
  END;
END $$;

-- ---- assertion 4: disabled entitlement blocks any creation -----------------
UPDATE public.entitlements SET enabled=false
 WHERE tenant_id=(SELECT tenant_id FROM _t) AND feature_key='tasks.active';

DO $$
DECLARE _ok boolean;
BEGIN
  _ok := public.check_quota((SELECT tenant_id FROM _t), 'tasks.active', 1);
  IF _ok THEN RAISE EXCEPTION 'FAIL quota-disabled: check_quota returned TRUE while feature disabled'; END IF;
  RAISE NOTICE 'OK quota-disabled: disabled entitlement denies quota';
END $$;

-- ---- assertion 5: NULL limit = unlimited -----------------------------------
UPDATE public.entitlements SET enabled=true, quota_limit=NULL
 WHERE tenant_id=(SELECT tenant_id FROM _t) AND feature_key='tasks.active';

DO $$
DECLARE _ok boolean;
BEGIN
  _ok := public.check_quota((SELECT tenant_id FROM _t), 'tasks.active', 999999);
  IF NOT _ok THEN RAISE EXCEPTION 'FAIL quota-unlimited: NULL quota_limit should be unlimited'; END IF;
  RAISE NOTICE 'OK quota-unlimited: NULL quota_limit permits any delta';
END $$;

ROLLBACK;
\echo === PASS 02_quota_gate ===