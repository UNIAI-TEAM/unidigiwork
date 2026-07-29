-- ==========================================================================
-- Integration test: RPC failures must NOT leak quota
--
-- Guarantees the "quota + business write + record_usage" sequence is fully
-- transactional. If anything after check_quota fails — including code that
-- runs after record_usage has already incremented usage_counters — the
-- entire transaction rolls back and the counter is left untouched.
--
-- Two scenarios:
--   A) Failure BETWEEN check_quota and record_usage
--      (FK violation on task_assignees when _assignee_id doesn't exist).
--   B) Failure AFTER record_usage has incremented the counter
--      (simulated with SAVEPOINT + ROLLBACK TO SAVEPOINT wrapping a
--       successful create_task — proves rollback undoes the increment).
-- ==========================================================================
\ir _helpers.sql

BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :OWNER_A, 'role','authenticated')::text, true);

CREATE TEMP TABLE _t AS
SELECT * FROM public.provision_tenant(
  'itest_leak', 'itest-leak-'||substr(md5(random()::text),1,10),
  :OWNER_A::uuid, 'WS-LEAK');

-- Generous limit so the test never trips on the limit itself.
SELECT public._test_seed_entitlement(tenant_id,'tasks.active',true,1000) FROM _t;

-- Baseline: no usage yet.
DO $$
DECLARE _tid uuid; _cur bigint;
BEGIN
  SELECT tenant_id INTO _tid FROM _t;
  SELECT COALESCE(total,0) INTO _cur FROM public.usage_counters
    WHERE tenant_id=_tid AND meter_key='tasks.active'
      AND period_start=date_trunc('month',now());
  IF COALESCE(_cur,0) <> 0 THEN
    RAISE EXCEPTION 'FAIL baseline: expected usage=0, got %', _cur;
  END IF;
  RAISE NOTICE 'OK baseline: usage=0';
END $$;

-- ---- Scenario A: FK failure after check_quota, before record_usage --------
DO $$
DECLARE _tid uuid; _ws uuid; _cur bigint; _err text;
BEGIN
  SELECT tenant_id, workspace_id INTO _tid, _ws FROM _t;
  BEGIN
    PERFORM public.create_task(_ws,'leak-A',NULL,'normal',NULL,
      '00000000-0000-0000-0000-000000000000'::uuid, -- non-existent assignee → FK violation
      'leak-A-idem',NULL);
    RAISE EXCEPTION 'FAIL A: create_task should have failed on FK';
  EXCEPTION WHEN OTHERS THEN
    _err := SQLERRM;
    IF _err ~* 'quota' THEN
      RAISE EXCEPTION 'FAIL A: unexpected quota error %', _err;
    END IF;
    RAISE NOTICE 'OK A: expected FK/foreign_key failure (%).', _err;
  END;
  SELECT COALESCE(total,0) INTO _cur FROM public.usage_counters
    WHERE tenant_id=_tid AND meter_key='tasks.active'
      AND period_start=date_trunc('month',now());
  IF COALESCE(_cur,0) <> 0 THEN
    RAISE EXCEPTION 'FAIL A: quota leaked, usage=% (expected 0)', _cur;
  END IF;
  -- The task row itself must not exist either.
  IF EXISTS (SELECT 1 FROM public.tasks WHERE workspace_id=_ws AND title='leak-A') THEN
    RAISE EXCEPTION 'FAIL A: task row leaked despite failure';
  END IF;
  RAISE NOTICE 'OK A: no quota leak, no orphan row';
END $$;

-- ---- Scenario B: failure AFTER record_usage already incremented ----------
-- Wrap a fully successful create_task in a SAVEPOINT then roll back to
-- simulate a downstream failure occurring after record_usage committed its
-- increment inside the outer transaction.
-- A PL/pgSQL BEGIN...EXCEPTION block is an implicit subtransaction: any
-- exception raised inside it rolls back everything the block did — including
-- the record_usage increment — before control returns to the outer tx.
DO $$
DECLARE _tid uuid; _ws uuid; _mid bigint; _after bigint;
BEGIN
  SELECT tenant_id, workspace_id INTO _tid, _ws FROM _t;
  BEGIN
    PERFORM public.create_task(_ws,'leak-B',NULL,'normal',NULL,NULL,'leak-B-idem',NULL);
    SELECT total INTO _mid FROM public.usage_counters
      WHERE tenant_id=_tid AND meter_key='tasks.active'
        AND period_start=date_trunc('month',now());
    IF COALESCE(_mid,0) <> 1 THEN
      RAISE EXCEPTION 'FAIL B: expected usage=1 mid-subtx, got %', _mid;
    END IF;
    -- Simulate any post-record_usage failure inside the same RPC transaction.
    RAISE EXCEPTION 'SIMULATED_POST_USAGE_FAILURE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'SIMULATED_POST_USAGE_FAILURE' THEN
      RAISE EXCEPTION 'FAIL B: unexpected error %', SQLERRM;
    END IF;
  END;

  SELECT COALESCE(total,0) INTO _after FROM public.usage_counters
    WHERE tenant_id=_tid AND meter_key='tasks.active'
      AND period_start=date_trunc('month',now());
  IF COALESCE(_after,0) <> 0 THEN
    RAISE EXCEPTION 'FAIL B: quota leaked after subtx rollback, usage=% (expected 0)', _after;
  END IF;
  IF EXISTS (SELECT 1 FROM public.tasks WHERE workspace_id=_ws AND title='leak-B') THEN
    RAISE EXCEPTION 'FAIL B: task row survived rollback';
  END IF;
  RAISE NOTICE 'OK B: subtransaction rollback undid quota increment cleanly';
END $$;

-- ---- Scenario C: quota gate itself denies → no counter movement ----------
DO $$
DECLARE _tid uuid; _ws uuid; _cur bigint; _err text;
BEGIN
  SELECT tenant_id, workspace_id INTO _tid, _ws FROM _t;
  -- Force limit to 0 so the very next call is denied at check_quota.
  PERFORM public._test_seed_entitlement(_tid,'tasks.active',true,0);
  BEGIN
    PERFORM public.create_task(_ws,'leak-C',NULL,'normal',NULL,NULL,'leak-C-idem',NULL);
    RAISE EXCEPTION 'FAIL C: create_task should have been denied';
  EXCEPTION WHEN OTHERS THEN
    _err := SQLERRM;
    IF _err !~* 'quota' THEN RAISE EXCEPTION 'FAIL C: unexpected error %', _err; END IF;
  END;
  SELECT COALESCE(total,0) INTO _cur FROM public.usage_counters
    WHERE tenant_id=_tid AND meter_key='tasks.active'
      AND period_start=date_trunc('month',now());
  IF COALESCE(_cur,0) <> 0 THEN
    RAISE EXCEPTION 'FAIL C: usage moved despite gate denial (%)', _cur;
  END IF;
  RAISE NOTICE 'OK C: check_quota denial leaves counter untouched';
END $$;

ROLLBACK;
\echo === PASS 09_rpc_failure_no_quota_leak ===