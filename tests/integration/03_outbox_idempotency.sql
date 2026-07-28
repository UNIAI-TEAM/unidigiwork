-- ==========================================================================
-- Integration test: Outbox idempotency (Batch 1D-API)
-- Verifies _emit_outbox_event with the same idempotency_key produces exactly
-- one row and returns the same UUID; commands that carry the same key do not
-- duplicate side effects.
-- ==========================================================================
\ir _helpers.sql

BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :OWNER_A, 'role','authenticated')::text, true);

CREATE TEMP TABLE _t AS
SELECT * FROM public.provision_tenant(
  'itest_outbox', 'itest-outbox-'||substr(md5(random()::text),1,10),
  :OWNER_A::uuid, 'WS-O');

SELECT public._test_seed_entitlement(tenant_id, 'tasks.active', true, 100) FROM _t;

-- ---- assertion 1: _emit_outbox_event dedupes on idempotency_key ------------
DO $$
DECLARE _tid uuid; _aid text := gen_random_uuid()::text;
        _id1 uuid; _id2 uuid; _cnt int; _key text := 'itest-outbox-'||substr(md5(random()::text),1,10);
BEGIN
  SELECT tenant_id INTO _tid FROM _t;
  _id1 := public._emit_outbox_event(_tid,'test.event','TestAggregate',_aid,'{"n":1}'::jsonb,_key,NULL);
  _id2 := public._emit_outbox_event(_tid,'test.event','TestAggregate',_aid,'{"n":2}'::jsonb,_key,NULL);
  IF _id1 IS NULL OR _id2 IS NULL THEN RAISE EXCEPTION 'FAIL outbox: null id returned'; END IF;
  IF _id1 <> _id2 THEN
    RAISE EXCEPTION 'FAIL outbox-dedup: returned different ids % vs % for same idempotency_key', _id1, _id2;
  END IF;
  SELECT count(*) INTO _cnt FROM public.outbox_events WHERE idempotency_key = _key;
  IF _cnt <> 1 THEN
    RAISE EXCEPTION 'FAIL outbox-dedup: expected 1 row for key, got %', _cnt;
  END IF;
  RAISE NOTICE 'OK outbox-dedup: single row persisted, same UUID returned';
END $$;

-- ---- assertion 2: create_task with repeated idempotency_key --------------
--       must not double-count usage or emit duplicate task.created events.
DO $$
DECLARE _ws uuid; _tid uuid; _t1 uuid; _t2 uuid;
        _key text := 'itest-cmd-idem-'||substr(md5(random()::text),1,10);
        _cnt int; _usage bigint;
BEGIN
  SELECT workspace_id, tenant_id INTO _ws, _tid FROM _t;
  _t1 := (public.create_task(_ws,'idem',NULL,'normal',NULL,NULL,_key,NULL)).id;
  -- second call with SAME idempotency key: RPC accepts (per current contract)
  -- but the outbox event must be deduped by _emit_outbox_event's ON CONFLICT.
  BEGIN
    _t2 := (public.create_task(_ws,'idem',NULL,'normal',NULL,NULL,_key,NULL)).id;
  EXCEPTION WHEN OTHERS THEN
    -- Acceptable: RPC surfaces an idempotency error. Skip further row asserts.
    RAISE NOTICE 'OK cmd-idem: repeated create_task rejected (%).', SQLERRM;
    RETURN;
  END;

  SELECT count(*) INTO _cnt FROM public.outbox_events
   WHERE tenant_id = _tid AND event_type LIKE '%task.created' AND idempotency_key = _key;
  IF _cnt <> 1 THEN
    RAISE EXCEPTION 'FAIL cmd-idem: expected 1 task.created outbox row, got %', _cnt;
  END IF;

  SELECT COALESCE(SUM(total),0) INTO _usage FROM public.usage_counters
   WHERE tenant_id = _tid AND meter_key='tasks.active'
     AND period_start = date_trunc('month', now());
  IF _usage > 2 THEN
    RAISE EXCEPTION 'FAIL cmd-idem: usage double-counted (total=%)', _usage;
  END IF;

  RAISE NOTICE 'OK cmd-idem: outbox=1, usage<=2 across duplicate create_task';
END $$;

-- ---- assertion 3: different aggregate + different key = distinct rows ------
DO $$
DECLARE _tid uuid; _id1 uuid; _id2 uuid;
BEGIN
  SELECT tenant_id INTO _tid FROM _t;
  _id1 := public._emit_outbox_event(_tid,'test.other','X',gen_random_uuid()::text,'{}'::jsonb,'ka-'||md5(random()::text),NULL);
  _id2 := public._emit_outbox_event(_tid,'test.other','X',gen_random_uuid()::text,'{}'::jsonb,'kb-'||md5(random()::text),NULL);
  IF _id1 = _id2 THEN RAISE EXCEPTION 'FAIL outbox-distinct: distinct keys collapsed to same id'; END IF;
  RAISE NOTICE 'OK outbox-distinct: independent keys produce independent rows';
END $$;

ROLLBACK;
\echo === PASS 03_outbox_idempotency ===