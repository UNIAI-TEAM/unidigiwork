-- ==========================================================================
-- Integration test: QUOTA_EXCEEDED per RPC (Batch 1D-API)
-- For each business RPC that gates on a meter, verify:
--   - Calls up to the entitlement limit succeed
--   - The next call raises a quota error (mapped to QUOTA_EXCEEDED)
--   - With enabled+NULL limit (Business/Enterprise plan), no call is rejected
-- Meters covered:
--   create_task             → tasks.active
--   upload_document_version → documents.storage_bytes
--   schedule_meeting        → meetings.scheduled_per_month
--   start_workflow_run      → workflows.runs_per_month
-- ==========================================================================
\ir _helpers.sql

BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :OWNER_A, 'role','authenticated')::text, true);

CREATE TEMP TABLE _t AS
SELECT * FROM public.provision_tenant(
  'itest_qx', 'itest-qx-'||substr(md5(random()::text),1,10),
  :OWNER_A::uuid, 'WS-QX');

-- ---------------------------------------------------------------------------
-- 1) create_task → tasks.active (Free-like limit = 2)
-- ---------------------------------------------------------------------------
SELECT public._test_seed_entitlement(tenant_id, 'tasks.active', true, 2) FROM _t;

DO $$
DECLARE _ws uuid; _err text;
BEGIN
  SELECT workspace_id INTO _ws FROM _t;
  PERFORM public.create_task(_ws, 'qx-t1', NULL, 'normal', NULL, NULL, 'qx-t-1', NULL);
  PERFORM public.create_task(_ws, 'qx-t2', NULL, 'normal', NULL, NULL, 'qx-t-2', NULL);
  BEGIN
    PERFORM public.create_task(_ws, 'qx-t3', NULL, 'normal', NULL, NULL, 'qx-t-3', NULL);
    RAISE EXCEPTION 'FAIL create_task: 3rd task created despite limit=2';
  EXCEPTION WHEN OTHERS THEN
    _err := SQLERRM;
    IF _err !~* 'quota' THEN
      RAISE EXCEPTION 'FAIL create_task: unexpected error %', _err;
    END IF;
    RAISE NOTICE 'OK create_task: QUOTA_EXCEEDED at N+1 (%).', _err;
  END;
END $$;

-- unlimited (Business): must accept any delta
SELECT public._test_seed_entitlement(tenant_id, 'tasks.active', true, NULL) FROM _t;
DO $$
DECLARE _ws uuid;
BEGIN
  SELECT workspace_id INTO _ws FROM _t;
  PERFORM public.create_task(_ws, 'qx-t-unl', NULL, 'normal', NULL, NULL, 'qx-t-unl', NULL);
  RAISE NOTICE 'OK create_task: NULL limit permits creation';
END $$;

-- ---------------------------------------------------------------------------
-- 2) upload_document_version → documents.storage_bytes (limit = 2048 bytes)
-- ---------------------------------------------------------------------------
-- Seed storage unlimited to create the base document (size=0 skips quota anyway)
SELECT public._test_seed_entitlement(tenant_id, 'documents.storage_bytes', true, NULL) FROM _t;

CREATE TEMP TABLE _doc AS
SELECT (public.create_document(
          (SELECT workspace_id FROM _t),
          'qx-doc', 'My Documents', ARRAY[]::text[], NULL, NULL, 0,
          'qx-doc-init', NULL)).id AS id;

-- tighten storage limit to 2048 bytes; two 1024-byte uploads fit, third fails
SELECT public._test_seed_entitlement(tenant_id, 'documents.storage_bytes', true, 2048) FROM _t;

DO $$
DECLARE _did uuid; _err text; _ref jsonb := '{"bucket":"docs","path":"x"}'::jsonb;
BEGIN
  SELECT id INTO _did FROM _doc;
  PERFORM public.upload_document_version(_did, _ref, 'text/plain', 1024, 'v1', 'qx-v-1', NULL);
  PERFORM public.upload_document_version(_did, _ref, 'text/plain', 1024, 'v2', 'qx-v-2', NULL);
  BEGIN
    PERFORM public.upload_document_version(_did, _ref, 'text/plain', 1, 'v3', 'qx-v-3', NULL);
    RAISE EXCEPTION 'FAIL upload_document_version: accepted upload past 2048-byte limit';
  EXCEPTION WHEN OTHERS THEN
    _err := SQLERRM;
    IF _err !~* 'quota' THEN
      RAISE EXCEPTION 'FAIL upload_document_version: unexpected error %', _err;
    END IF;
    RAISE NOTICE 'OK upload_document_version: QUOTA_EXCEEDED at overflow (%).', _err;
  END;
END $$;

-- unlimited storage: large delta must pass
SELECT public._test_seed_entitlement(tenant_id, 'documents.storage_bytes', true, NULL) FROM _t;
DO $$
DECLARE _did uuid; _ref jsonb := '{"bucket":"docs","path":"x"}'::jsonb;
BEGIN
  SELECT id INTO _did FROM _doc;
  PERFORM public.upload_document_version(_did, _ref, 'text/plain', 10_000_000, 'v-unl', 'qx-v-unl', NULL);
  RAISE NOTICE 'OK upload_document_version: NULL limit permits large upload';
END $$;

-- ---------------------------------------------------------------------------
-- 3) schedule_meeting → meetings.scheduled_per_month (limit = 1)
-- ---------------------------------------------------------------------------
SELECT public._test_seed_entitlement(tenant_id, 'meetings.scheduled_per_month', true, 1) FROM _t;

DO $$
DECLARE _ws uuid; _err text; _start timestamptz := now() + interval '1 day';
BEGIN
  SELECT workspace_id INTO _ws FROM _t;
  PERFORM public.schedule_meeting(_ws, 'qx-m1', _start, _start + interval '30 min',
                                  NULL, 'UTC', NULL, NULL, NULL, 'qx-m-1', NULL);
  BEGIN
    PERFORM public.schedule_meeting(_ws, 'qx-m2', _start, _start + interval '30 min',
                                    NULL, 'UTC', NULL, NULL, NULL, 'qx-m-2', NULL);
    RAISE EXCEPTION 'FAIL schedule_meeting: 2nd meeting created despite limit=1';
  EXCEPTION WHEN OTHERS THEN
    _err := SQLERRM;
    IF _err !~* 'quota' THEN
      RAISE EXCEPTION 'FAIL schedule_meeting: unexpected error %', _err;
    END IF;
    RAISE NOTICE 'OK schedule_meeting: QUOTA_EXCEEDED at N+1 (%).', _err;
  END;
END $$;

-- unlimited: must accept
SELECT public._test_seed_entitlement(tenant_id, 'meetings.scheduled_per_month', true, NULL) FROM _t;
DO $$
DECLARE _ws uuid; _start timestamptz := now() + interval '2 day';
BEGIN
  SELECT workspace_id INTO _ws FROM _t;
  PERFORM public.schedule_meeting(_ws, 'qx-m-unl', _start, _start + interval '30 min',
                                  NULL, 'UTC', NULL, NULL, NULL, 'qx-m-unl', NULL);
  RAISE NOTICE 'OK schedule_meeting: NULL limit permits creation';
END $$;

-- ---------------------------------------------------------------------------
-- 4) start_workflow_run → workflows.runs_per_month (limit = 2)
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE _wf AS
SELECT (public.create_workflow(
          (SELECT workspace_id FROM _t),
          'qx-wf',
          '{"steps":[{"key":"noop"}]}'::jsonb,
          NULL, 'qx-wf-init', NULL)).id AS id;

DO $$
DECLARE _wid uuid;
BEGIN
  SELECT id INTO _wid FROM _wf;
  PERFORM public.publish_workflow(_wid, NULL, 'qx-wf-pub', NULL);
END $$;

SELECT public._test_seed_entitlement(tenant_id, 'workflows.runs_per_month', true, 2) FROM _t;

DO $$
DECLARE _wid uuid; _err text;
BEGIN
  SELECT id INTO _wid FROM _wf;
  PERFORM public.start_workflow_run(_wid, '{}'::jsonb, 'qx-run-1', NULL);
  PERFORM public.start_workflow_run(_wid, '{}'::jsonb, 'qx-run-2', NULL);
  BEGIN
    PERFORM public.start_workflow_run(_wid, '{}'::jsonb, 'qx-run-3', NULL);
    RAISE EXCEPTION 'FAIL start_workflow_run: 3rd run started despite limit=2';
  EXCEPTION WHEN OTHERS THEN
    _err := SQLERRM;
    IF _err !~* 'quota' THEN
      RAISE EXCEPTION 'FAIL start_workflow_run: unexpected error %', _err;
    END IF;
    RAISE NOTICE 'OK start_workflow_run: QUOTA_EXCEEDED at N+1 (%).', _err;
  END;
END $$;

-- unlimited: must accept
SELECT public._test_seed_entitlement(tenant_id, 'workflows.runs_per_month', true, NULL) FROM _t;
DO $$
DECLARE _wid uuid;
BEGIN
  SELECT id INTO _wid FROM _wf;
  PERFORM public.start_workflow_run(_wid, '{}'::jsonb, 'qx-run-unl', NULL);
  RAISE NOTICE 'OK start_workflow_run: NULL limit permits run';
END $$;

ROLLBACK;
\echo === PASS 05_quota_exceeded_per_rpc ===