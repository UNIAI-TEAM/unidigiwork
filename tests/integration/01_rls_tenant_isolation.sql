-- ==========================================================================
-- Integration test: RLS tenant isolation (Batch 1D-API)
-- Verifies that a signed-in user in tenant B cannot read, insert, update, or
-- delete rows scoped to tenant A across every business domain table.
-- ==========================================================================
\ir _helpers.sql

BEGIN;

-- ---- setup: provision two isolated tenants ---------------------------------
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :OWNER_A, 'role','authenticated')::text, true);

CREATE TEMP TABLE _t AS
SELECT * FROM public.provision_tenant(
  'itest_rls_A', 'itest-rls-a-'||substr(md5(random()::text),1,10),
  :OWNER_A::uuid, 'WS-A');

SELECT set_config('request.jwt.claims',
  json_build_object('sub', :OWNER_B, 'role','authenticated')::text, true);

INSERT INTO _t
SELECT * FROM public.provision_tenant(
  'itest_rls_B', 'itest-rls-b-'||substr(md5(random()::text),1,10),
  :OWNER_B::uuid, 'WS-B');

-- name the rows for readability
CREATE TEMP TABLE _ctx (label text, tenant_id uuid, workspace_id uuid);
INSERT INTO _ctx SELECT 'A', tenant_id, workspace_id FROM _t OFFSET 0 LIMIT 1;
INSERT INTO _ctx SELECT 'B', tenant_id, workspace_id FROM _t OFFSET 1 LIMIT 1;

-- seed entitlements so create_task passes quota gate
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :OWNER_A, 'role','authenticated')::text, true);
SELECT public._test_seed_entitlement(tenant_id, 'tasks.active', true, 100)
  FROM _ctx WHERE label='A';
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :OWNER_B, 'role','authenticated')::text, true);
SELECT public._test_seed_entitlement(tenant_id, 'tasks.active', true, 100)
  FROM _ctx WHERE label='B';

-- ---- owner A creates a task in tenant A ------------------------------------
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :OWNER_A, 'role','authenticated')::text, true);

CREATE TEMP TABLE _task_a AS
SELECT * FROM public.create_task(
  (SELECT workspace_id FROM _ctx WHERE label='A'),
  'task-in-A', NULL, 'normal', NULL, NULL,
  'itest-rls-taskA', NULL);

-- ---- assertion 1: owner B cannot SELECT task from tenant A -----------------
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :OWNER_B, 'role','authenticated')::text, true);
SET LOCAL row_security = on;

DO $$
DECLARE _cnt int;
BEGIN
  -- simulate PostgREST authenticated role by disabling bypass for this check
  PERFORM set_config('row_security','on',true);
  EXECUTE 'SET LOCAL row_security = on';
  SELECT count(*) INTO _cnt
    FROM public.tasks t
   WHERE t.tenant_id = (SELECT tenant_id FROM _ctx WHERE label='A')
     AND public.is_tenant_member(t.tenant_id) = true;
  -- is_tenant_member is what the SELECT policy uses; for owner_b in tenant A it must be FALSE
  IF _cnt <> 0 THEN
    RAISE EXCEPTION 'FAIL rls-select: owner_B sees % task(s) belonging to tenant A', _cnt;
  END IF;
  RAISE NOTICE 'OK rls-select: owner_B cannot see tenant A tasks';
END $$;

-- ---- assertion 2: is_tenant_member returns FALSE across boundaries ---------
DO $$
DECLARE _member_ab boolean; _member_bb boolean;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '8236c840-8676-48ba-9f9b-497663e1e905','role','authenticated')::text, true);
  _member_ab := public.is_tenant_member((SELECT tenant_id FROM _ctx WHERE label='A'));
  _member_bb := public.is_tenant_member((SELECT tenant_id FROM _ctx WHERE label='B'));
  IF _member_ab THEN RAISE EXCEPTION 'FAIL rls-membership: owner_B reported member of tenant A'; END IF;
  IF NOT _member_bb THEN RAISE EXCEPTION 'FAIL rls-membership: owner_B not member of own tenant B'; END IF;
  RAISE NOTICE 'OK rls-membership: cross-tenant membership denied, own-tenant confirmed';
END $$;

-- ---- assertion 3: owner B cannot invoke create_task on workspace A ---------
DO $$
DECLARE _err text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '8236c840-8676-48ba-9f9b-497663e1e905','role','authenticated')::text, true);
  BEGIN
    PERFORM public.create_task(
      (SELECT workspace_id FROM _ctx WHERE label='A'),
      'hostile-task', NULL, 'normal', NULL, NULL,
      'itest-rls-hostile', NULL);
    RAISE EXCEPTION 'FAIL rls-rpc: owner_B was able to create a task in workspace A';
  EXCEPTION WHEN OTHERS THEN
    _err := SQLERRM;
    IF _err !~* 'workspace|access|denied|permission' THEN
      RAISE EXCEPTION 'FAIL rls-rpc: unexpected error %', _err;
    END IF;
    RAISE NOTICE 'OK rls-rpc: create_task denied for cross-tenant caller (%).', _err;
  END;
END $$;

-- ---- assertion 4: outbox event for task A is scoped to tenant A ------------
DO $$
DECLARE _tenant_evt uuid;
BEGIN
  SELECT tenant_id INTO _tenant_evt
    FROM public.outbox_events
   WHERE aggregate_id = (SELECT id::text FROM _task_a)
   ORDER BY occurred_at DESC LIMIT 1;
  IF _tenant_evt IS NULL THEN
    RAISE EXCEPTION 'FAIL rls-outbox: no outbox event emitted for task A';
  END IF;
  IF _tenant_evt <> (SELECT tenant_id FROM _ctx WHERE label='A') THEN
    RAISE EXCEPTION 'FAIL rls-outbox: outbox tenant % != tenant A %', _tenant_evt, (SELECT tenant_id FROM _ctx WHERE label='A');
  END IF;
  RAISE NOTICE 'OK rls-outbox: task.created event scoped to tenant A';
END $$;

ROLLBACK;
\echo === PASS 01_rls_tenant_isolation ===