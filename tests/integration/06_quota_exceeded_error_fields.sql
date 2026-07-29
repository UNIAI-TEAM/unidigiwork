-- ==========================================================================
-- Integration test: QUOTA_EXCEEDED error carries full structured DETAIL
-- Asserts the DETAIL JSON payload on the raised exception contains:
--   code, tenant_id, meter, enabled, quota_limit,
--   current_usage, attempted_delta, current_remaining
-- Per plan:
--   - Free-like  (finite limit): remaining == 0 at overflow
--   - Business-like (NULL limit): no exception raised (sanity — see test 05)
--   - Disabled (enabled=false): enabled=false, quota_limit reflected as-is
-- Covers meters: tasks.active, documents.storage_bytes,
--                meetings.scheduled_per_month, workflows.runs_per_month
-- ==========================================================================
\ir _helpers.sql

BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :OWNER_A, 'role','authenticated')::text, true);

CREATE TEMP TABLE _t AS
SELECT * FROM public.provision_tenant(
  'itest_qxfields', 'itest-qxf-'||substr(md5(random()::text),1,10),
  :OWNER_A::uuid, 'WS-QXF');

-- Helper: run stmt, catch QUOTA_EXCEEDED, parse DETAIL, assert required fields.
CREATE OR REPLACE FUNCTION pg_temp._assert_quota_detail(
  _label text, _stmt text, _expected_meter text,
  _expected_limit bigint, _expected_delta bigint, _expected_remaining bigint,
  _expected_enabled boolean DEFAULT true
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  _msg  text;
  _det  text;
  _j    jsonb;
BEGIN
  BEGIN
    EXECUTE _stmt;
    RAISE EXCEPTION 'FAIL[%]: no exception raised', _label;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT, _det = PG_EXCEPTION_DETAIL;
    IF _msg NOT LIKE 'QUOTA_EXCEEDED%' THEN
      RAISE EXCEPTION 'FAIL[%]: wrong message: %', _label, _msg;
    END IF;
    IF _det IS NULL OR _det = '' THEN
      RAISE EXCEPTION 'FAIL[%]: DETAIL is empty', _label;
    END IF;
    BEGIN _j := _det::jsonb;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'FAIL[%]: DETAIL not JSON: %', _label, _det;
    END;
    -- Presence of required keys
    IF NOT (_j ? 'code' AND _j ? 'tenant_id' AND _j ? 'meter'
        AND _j ? 'enabled' AND _j ? 'quota_limit'
        AND _j ? 'attempted_delta' AND _j ? 'current_remaining'
        AND _j ? 'current_usage') THEN
      RAISE EXCEPTION 'FAIL[%]: missing keys in DETAIL: %', _label, _j;
    END IF;
    -- Value assertions
    IF (_j->>'code') <> 'QUOTA_EXCEEDED' THEN
      RAISE EXCEPTION 'FAIL[%]: bad code %', _label, _j->>'code'; END IF;
    IF (_j->>'meter') <> _expected_meter THEN
      RAISE EXCEPTION 'FAIL[%]: meter %', _label, _j->>'meter'; END IF;
    IF (_j->>'tenant_id') !~ '^[0-9a-f-]{36}$' THEN
      RAISE EXCEPTION 'FAIL[%]: bad tenant_id %', _label, _j->>'tenant_id'; END IF;
    IF ((_j->>'enabled')::boolean) <> _expected_enabled THEN
      RAISE EXCEPTION 'FAIL[%]: enabled=% expected %',
        _label, _j->>'enabled', _expected_enabled; END IF;
    IF ((_j->>'attempted_delta')::bigint) <> _expected_delta THEN
      RAISE EXCEPTION 'FAIL[%]: attempted_delta=% expected %',
        _label, _j->>'attempted_delta', _expected_delta; END IF;
    IF _expected_limit IS NULL THEN
      IF _j->>'quota_limit' IS NOT NULL AND _j->'quota_limit' <> 'null'::jsonb THEN
        RAISE EXCEPTION 'FAIL[%]: quota_limit=% expected null',
          _label, _j->>'quota_limit'; END IF;
    ELSE
      IF ((_j->>'quota_limit')::bigint) <> _expected_limit THEN
        RAISE EXCEPTION 'FAIL[%]: quota_limit=% expected %',
          _label, _j->>'quota_limit', _expected_limit; END IF;
    END IF;
    IF _expected_remaining IS NULL THEN
      IF _j->>'current_remaining' IS NOT NULL AND _j->'current_remaining' <> 'null'::jsonb THEN
        RAISE EXCEPTION 'FAIL[%]: current_remaining=% expected null',
          _label, _j->>'current_remaining'; END IF;
    ELSE
      IF ((_j->>'current_remaining')::bigint) <> _expected_remaining THEN
        RAISE EXCEPTION 'FAIL[%]: current_remaining=% expected %',
          _label, _j->>'current_remaining', _expected_remaining; END IF;
    END IF;
    RAISE NOTICE 'OK[%]: %', _label, _j;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- Free-like: finite limits — exhaust then trigger overflow
-- ---------------------------------------------------------------------------

-- 1) tasks.active  (limit=2)
SELECT public._test_seed_entitlement(tenant_id, 'tasks.active', true, 2) FROM _t;
DO $$
DECLARE _ws uuid; _sql text;
BEGIN
  SELECT workspace_id INTO _ws FROM _t;
  PERFORM public.create_task(_ws, 'qxf-t1', NULL,'normal',NULL,NULL,'qxf-t-1',NULL);
  PERFORM public.create_task(_ws, 'qxf-t2', NULL,'normal',NULL,NULL,'qxf-t-2',NULL);
  _sql := format('SELECT public.create_task(%L::uuid, %L, NULL, %L::task_priority, NULL, NULL, %L, NULL)',
                 _ws, 'qxf-t3', 'normal', 'qxf-t-3');
  PERFORM pg_temp._assert_quota_detail('free/tasks.active', _sql,
          'tasks.active', 2, 1, 0, true);
END $$;

-- 2) meetings.scheduled_per_month (limit=1)
SELECT public._test_seed_entitlement(tenant_id, 'meetings.scheduled_per_month', true, 1) FROM _t;
DO $$
DECLARE _ws uuid; _sql text; _start timestamptz := now() + interval '1 day';
BEGIN
  SELECT workspace_id INTO _ws FROM _t;
  PERFORM public.schedule_meeting(_ws,'qxf-m1',_start,_start+interval '30 min',
          NULL,'UTC',NULL,NULL,NULL,'qxf-m-1',NULL);
  _sql := format($f$SELECT public.schedule_meeting(%L::uuid,'qxf-m2',%L::timestamptz,%L::timestamptz,NULL,'UTC',NULL,NULL,NULL,'qxf-m-2',NULL)$f$,
                 _ws, _start, _start + interval '30 min');
  PERFORM pg_temp._assert_quota_detail('free/meetings', _sql,
          'meetings.scheduled_per_month', 1, 1, 0, true);
END $$;

-- 3) documents.storage_bytes (limit=2048)
SELECT public._test_seed_entitlement(tenant_id, 'documents.storage_bytes', true, NULL) FROM _t;
CREATE TEMP TABLE _doc AS
SELECT (public.create_document(
  (SELECT workspace_id FROM _t),
  'qxf-doc','My Documents',ARRAY[]::text[],NULL,NULL,0,'qxf-doc-init',NULL)).id AS id;

SELECT public._test_seed_entitlement(tenant_id, 'documents.storage_bytes', true, 2048) FROM _t;
DO $$
DECLARE _did uuid; _sql text; _ref jsonb := '{"bucket":"docs","path":"x"}'::jsonb;
BEGIN
  SELECT id INTO _did FROM _doc;
  PERFORM public.upload_document_version(_did,_ref,'text/plain',1024,'v1','qxf-v-1',NULL);
  PERFORM public.upload_document_version(_did,_ref,'text/plain',2048,'v2','qxf-v-2',NULL);
  -- v3: size=4096, current stored=2048 → delta=2048; remaining=0
  _sql := format($f$SELECT public.upload_document_version(%L::uuid, %L::jsonb, 'text/plain', 4096, 'v3', 'qxf-v-3', NULL)$f$,
                 _did, _ref::text);
  PERFORM pg_temp._assert_quota_detail('free/documents', _sql,
          'documents.storage_bytes', 2048, 2048, 0, true);
END $$;

-- 4) workflows.runs_per_month (limit=2)
CREATE TEMP TABLE _wf AS
SELECT (public.create_workflow(
  (SELECT workspace_id FROM _t),'qxf-wf',
  '{"steps":[{"key":"noop"}]}'::jsonb, NULL,'qxf-wf-init',NULL)).id AS id;
DO $$ DECLARE _wid uuid; BEGIN
  SELECT id INTO _wid FROM _wf;
  PERFORM public.publish_workflow(_wid, NULL,'qxf-wf-pub',NULL);
END $$;

SELECT public._test_seed_entitlement(tenant_id, 'workflows.runs_per_month', true, 2) FROM _t;
DO $$
DECLARE _wid uuid; _sql text;
BEGIN
  SELECT id INTO _wid FROM _wf;
  PERFORM public.start_workflow_run(_wid,'{}'::jsonb,'qxf-run-1',NULL);
  PERFORM public.start_workflow_run(_wid,'{}'::jsonb,'qxf-run-2',NULL);
  _sql := format($f$SELECT public.start_workflow_run(%L::uuid, '{}'::jsonb, 'qxf-run-3', NULL)$f$, _wid);
  PERFORM pg_temp._assert_quota_detail('free/workflows', _sql,
          'workflows.runs_per_month', 2, 1, 0, true);
END $$;

-- ---------------------------------------------------------------------------
-- Disabled entitlement (enabled=false): expect enabled=false in DETAIL
-- ---------------------------------------------------------------------------
SELECT public._test_seed_entitlement(tenant_id, 'tasks.active', false, 10) FROM _t;
DO $$
DECLARE _ws uuid; _sql text;
BEGIN
  SELECT workspace_id INTO _ws FROM _t;
  _sql := format('SELECT public.create_task(%L::uuid, %L, NULL, %L::task_priority, NULL, NULL, %L, NULL)',
                 _ws, 'qxf-tD', 'normal', 'qxf-t-D');
  -- current_remaining: computed as limit - current_usage (=10-2=8) since limit is set
  PERFORM pg_temp._assert_quota_detail('disabled/tasks.active', _sql,
          'tasks.active', 10, 1, 8, false);
END $$;

ROLLBACK;
\echo === PASS 06_quota_exceeded_error_fields ===