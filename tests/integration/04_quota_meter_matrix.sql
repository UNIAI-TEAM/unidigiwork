-- ==========================================================================
-- Integration test: Quota meter matrix (Batch 1D-API)
-- For each of the 4 domain meters (tasks.active, documents.storage_bytes,
-- meetings.scheduled_per_month, workflows.runs_per_month), verify:
--   (a) enabled=false  → check_quota returns FALSE for any delta
--   (b) quota_limit=NULL (enabled=true) → check_quota returns TRUE for any delta
-- ==========================================================================
\ir _helpers.sql

BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :OWNER_A, 'role','authenticated')::text, true);

CREATE TEMP TABLE _t AS
SELECT * FROM public.provision_tenant(
  'itest_meter_matrix',
  'itest-meter-'||substr(md5(random()::text),1,10),
  :OWNER_A::uuid, 'WS-M');

DO $$
DECLARE
  _tenant uuid := (SELECT tenant_id FROM _t);
  _meters text[] := ARRAY[
    'tasks.active',
    'documents.storage_bytes',
    'meetings.scheduled_per_month',
    'workflows.runs_per_month'
  ];
  _m text;
  _ok boolean;
BEGIN
  FOREACH _m IN ARRAY _meters LOOP
    -- (a) disabled entitlement → always denied
    PERFORM public._test_seed_entitlement(_tenant, _m, false, 100);
    _ok := public.check_quota(_tenant, _m, 1);
    IF _ok THEN
      RAISE EXCEPTION 'FAIL meter-disabled(%): check_quota(delta=1) returned TRUE while enabled=false', _m;
    END IF;
    _ok := public.check_quota(_tenant, _m, 999999999);
    IF _ok THEN
      RAISE EXCEPTION 'FAIL meter-disabled(%): check_quota(delta=large) returned TRUE while enabled=false', _m;
    END IF;
    RAISE NOTICE 'OK meter-disabled(%): denies any delta', _m;

    -- (b) enabled + NULL quota_limit → unlimited
    PERFORM public._test_seed_entitlement(_tenant, _m, true, NULL);
    _ok := public.check_quota(_tenant, _m, 1);
    IF NOT _ok THEN
      RAISE EXCEPTION 'FAIL meter-unlimited(%): check_quota(delta=1) returned FALSE despite NULL limit', _m;
    END IF;
    _ok := public.check_quota(_tenant, _m, 9223372036854775806);
    IF NOT _ok THEN
      RAISE EXCEPTION 'FAIL meter-unlimited(%): check_quota(delta=BIGINT_MAX-1) returned FALSE despite NULL limit', _m;
    END IF;
    RAISE NOTICE 'OK meter-unlimited(%): permits any delta', _m;
  END LOOP;
END $$;

ROLLBACK;
\echo === PASS 04_quota_meter_matrix ===