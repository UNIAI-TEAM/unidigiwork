-- ==========================================================================
-- Integration test: change_subscription flushes entitlements immediately
--
-- Verifies that once change_subscription commits, subsequent RPCs read the
-- refreshed entitlements (via refresh_entitlements) and gate against the
-- new limits — both when upgrading (previous block lifts) and when
-- downgrading (new tighter limit blocks the next call).
-- ==========================================================================
\ir _helpers.sql

BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :OWNER_A, 'role','authenticated')::text, true);

CREATE TEMP TABLE _t AS
SELECT * FROM public.provision_tenant(
  'itest_cs', 'itest-cs-'||substr(md5(random()::text),1,10),
  :OWNER_A::uuid, 'WS-CS');

-- Baseline: force a tight tasks.active=2 limit regardless of the default plan.
SELECT public._test_seed_entitlement(tenant_id, 'tasks.active', true, 2) FROM _t;

-- ---- Phase 1: fill quota, prove baseline gate blocks the 3rd task ----------
DO $$
DECLARE _ws uuid; _err text;
BEGIN
  SELECT workspace_id INTO _ws FROM _t;
  PERFORM public.create_task(_ws,'cs-t1',NULL,'normal',NULL,NULL,'cs-t-1',NULL);
  PERFORM public.create_task(_ws,'cs-t2',NULL,'normal',NULL,NULL,'cs-t-2',NULL);
  BEGIN
    PERFORM public.create_task(_ws,'cs-t3',NULL,'normal',NULL,NULL,'cs-t-3',NULL);
    RAISE EXCEPTION 'FAIL phase1: 3rd task accepted with limit=2';
  EXCEPTION WHEN OTHERS THEN
    _err := SQLERRM;
    IF _err !~* 'quota' THEN RAISE EXCEPTION 'FAIL phase1: unexpected error %', _err; END IF;
    RAISE NOTICE 'OK phase1: baseline QUOTA_EXCEEDED (%).', _err;
  END;
END $$;

-- ---- Phase 2: upgrade → Business (unlimited tasks.active) ------------------
DO $$
DECLARE _tid uuid; _lim bigint; _en boolean;
BEGIN
  SELECT tenant_id INTO _tid FROM _t;
  PERFORM public.change_subscription(_tid,'business','cs-up','cs-corr-up',NULL);
  SELECT enabled, quota_limit INTO _en, _lim
    FROM public.entitlements WHERE tenant_id=_tid AND feature_key='tasks.active';
  IF NOT _en OR _lim IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL phase2: entitlements not refreshed (enabled=%, limit=%)', _en, _lim;
  END IF;
  RAISE NOTICE 'OK phase2: entitlements refreshed to unlimited';
END $$;

-- Next create_task must succeed even though we were previously blocked.
DO $$
DECLARE _ws uuid; _id uuid;
BEGIN
  SELECT workspace_id INTO _ws FROM _t;
  _id := (public.create_task(_ws,'cs-t3-after-upgrade',NULL,'normal',NULL,NULL,'cs-t-3b',NULL)).id;
  IF _id IS NULL THEN RAISE EXCEPTION 'FAIL phase2: create_task returned null'; END IF;
  _id := (public.create_task(_ws,'cs-t4-after-upgrade',NULL,'normal',NULL,NULL,'cs-t-4',NULL)).id;
  IF _id IS NULL THEN RAISE EXCEPTION 'FAIL phase2: 2nd create_task returned null'; END IF;
  RAISE NOTICE 'OK phase2: subsequent create_task uses refreshed unlimited entitlement';
END $$;

-- ---- Phase 3: downgrade back to Free (seeded limit=100 > usage=4) ----------
DO $$
DECLARE _tid uuid; _lim bigint;
BEGIN
  SELECT tenant_id INTO _tid FROM _t;
  PERFORM public.change_subscription(_tid,'free','cs-down','cs-corr-down',NULL);
  SELECT quota_limit INTO _lim
    FROM public.entitlements WHERE tenant_id=_tid AND feature_key='tasks.active';
  IF _lim IS NULL OR _lim <> 100 THEN
    RAISE EXCEPTION 'FAIL phase3: expected free plan limit=100, got %', _lim;
  END IF;
  RAISE NOTICE 'OK phase3: entitlements refreshed back to free limit=%', _lim;
END $$;

-- Simulate a stricter downgrade by pinning limit at current usage — the next
-- RPC must read this and block, proving each call reads the freshest row.
DO $$
DECLARE _tid uuid; _ws uuid; _cur bigint; _err text;
BEGIN
  SELECT tenant_id, workspace_id INTO _tid, _ws FROM _t;
  SELECT COALESCE(SUM(total),0) INTO _cur FROM public.usage_counters
    WHERE tenant_id=_tid AND meter_key='tasks.active'
      AND period_start=date_trunc('month',now());
  PERFORM public._test_seed_entitlement(_tid,'tasks.active',true,_cur);
  BEGIN
    PERFORM public.create_task(_ws,'cs-t5-post-downgrade',NULL,'normal',NULL,NULL,'cs-t-5',NULL);
    RAISE EXCEPTION 'FAIL phase3: task accepted despite tightened limit=%', _cur;
  EXCEPTION WHEN OTHERS THEN
    _err := SQLERRM;
    IF _err !~* 'quota' THEN RAISE EXCEPTION 'FAIL phase3: unexpected error %', _err; END IF;
    RAISE NOTICE 'OK phase3: tightened entitlement enforced on next RPC (%).', _err;
  END;
END $$;

-- ---- Phase 4: idempotency — repeating change_subscription is a no-op -------
DO $$
DECLARE _tid uuid; _sub_id_1 uuid; _sub_id_2 uuid;
BEGIN
  SELECT tenant_id INTO _tid FROM _t;
  _sub_id_1 := (public.change_subscription(_tid,'pro','cs-idem','cs-corr-idem',NULL)).id;
  _sub_id_2 := (public.change_subscription(_tid,'pro','cs-idem','cs-corr-idem',NULL)).id;
  IF _sub_id_1 <> _sub_id_2 THEN
    RAISE EXCEPTION 'FAIL phase4: idempotency key returned different subs % vs %', _sub_id_1, _sub_id_2;
  END IF;
  RAISE NOTICE 'OK phase4: idempotent change_subscription (sub=%)', _sub_id_1;
END $$;

ROLLBACK;
\echo === PASS 08_change_subscription_entitlements ===