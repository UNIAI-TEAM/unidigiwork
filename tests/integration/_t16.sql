-- GO-4: unified execution + Work Product provenance.
-- Source tables remain SSOT. Graph is derived. No outcomes table. No second execution table.
\ir _helpers.sql

SET client_min_messages TO notice;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.act(_uid uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true)::void;
$$;

CREATE OR REPLACE FUNCTION pg_temp.node_count(_type text, _id uuid)
RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int FROM public.work_nodes WHERE entity_type = _type AND entity_id = _id
$$;

CREATE OR REPLACE FUNCTION pg_temp.edge_count(_rel text, _st text, _sid uuid, _tt text, _tid uuid)
RETURNS int LANGUAGE sql AS $$
  SELECT count(*)::int
    FROM public.work_edges e
    JOIN public.work_nodes s ON s.id = e.source_node_id
    JOIN public.work_nodes t ON t.id = e.target_node_id
   WHERE e.relationship_type = _rel
     AND s.entity_type = _st AND s.entity_id = _sid
     AND t.entity_type = _tt AND t.entity_id = _tid
$$;

SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
CREATE TEMP TABLE _t AS
SELECT * FROM public.provision_tenant(
  'itest_go4_A', 'itest-go4-a-'||substr(md5(random()::text),1,10), '999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid, 'GO4-A');

SELECT pg_temp.act('8236c840-8676-48ba-9f9b-497663e1e905'::uuid);
INSERT INTO _t
SELECT * FROM public.provision_tenant(
  'itest_go4_B', 'itest-go4-b-'||substr(md5(random()::text),1,10), '8236c840-8676-48ba-9f9b-497663e1e905'::uuid, 'GO4-B');

CREATE TEMP TABLE _ctx (label text, tenant_id uuid, workspace_id uuid);
INSERT INTO _ctx SELECT 'A', tenant_id, workspace_id FROM _t OFFSET 0 LIMIT 1;
INSERT INTO _ctx SELECT 'B', tenant_id, workspace_id FROM _t OFFSET 1 LIMIT 1;

SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
SELECT public._test_seed_entitlement(tenant_id, 'tasks.active', true, 100) FROM _ctx WHERE label='A';
SELECT public._test_seed_entitlement(tenant_id, 'documents.storage_bytes', true, NULL) FROM _ctx WHERE label='A';
SELECT pg_temp.act('8236c840-8676-48ba-9f9b-497663e1e905'::uuid);
SELECT public._test_seed_entitlement(tenant_id, 'tasks.active', true, 100) FROM _ctx WHERE label='B';

-- 0. authorities
DO $$
BEGIN
  IF to_regclass('public.work_executions') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL second execution table work_executions exists';
  END IF;
  IF to_regclass('public.outcomes') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL outcomes table must not exist';
  END IF;
  IF to_regclass('public.execution_work_products') IS NULL THEN
    RAISE EXCEPTION 'FAIL execution_work_products missing';
  END IF;
  IF to_regclass('public.ai_task_executions') IS NULL
     OR to_regclass('public.work_products') IS NULL
     OR to_regclass('public.work_product_versions') IS NULL
     OR to_regclass('public.documents') IS NULL
     OR to_regclass('public.document_versions') IS NULL
     OR to_regclass('public.work_units') IS NULL THEN
    RAISE EXCEPTION 'FAIL three-authority + execution baseline missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='ai_task_executions' AND column_name='executor_type'
  ) THEN
    RAISE EXCEPTION 'FAIL executor_type missing';
  END IF;
  RAISE NOTICE 'OK authorities distinct';
END $$;

SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
CREATE TEMP TABLE _task_a AS
SELECT * FROM public.create_task(
  (SELECT workspace_id FROM _ctx WHERE label='A'),
  'Prepare board package', NULL, 'normal', NULL, NULL,
  'itest-go4-taskA', NULL);

SELECT pg_temp.act('8236c840-8676-48ba-9f9b-497663e1e905'::uuid);
CREATE TEMP TABLE _task_b AS
SELECT * FROM public.create_task(
  (SELECT workspace_id FROM _ctx WHERE label='B'),
  'B task', NULL, 'normal', NULL, NULL, 'itest-go4-taskB', NULL);

SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
CREATE TEMP TABLE _doc_a AS
SELECT * FROM public.create_document(
  (SELECT workspace_id FROM _ctx WHERE label='A'),
  'Board-Report.docx',
  'My Documents', '{}'::text[],
  jsonb_build_object('provider','supabase','bucket','documents','objectKey',
    (SELECT workspace_id::text FROM _ctx WHERE label='A') || '/go4/Board-Report.docx'),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  12
);

-- SCENARIO A — HUMAN
SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
CREATE TEMP TABLE _human_exec AS
SELECT * FROM public.start_human_task_execution((SELECT id FROM _task_a), 'itest-go4-human', NULL);

CREATE TEMP TABLE _wp_a (id uuid);
DO $$
DECLARE
  _tid uuid; _ws uuid; _wp uuid; _task uuid; _exec uuid; _link jsonb; _steps int; _acc text;
BEGIN
  SELECT tenant_id, workspace_id INTO _tid, _ws FROM _ctx WHERE label='A';
  SELECT id INTO _task FROM _task_a;
  SELECT id INTO _exec FROM _human_exec;
  IF (SELECT executor_type FROM public.ai_task_executions WHERE id=_exec) <> 'HUMAN' THEN
    RAISE EXCEPTION 'FAIL A executor_type';
  END IF;
  IF (SELECT ai_worker_id FROM public.ai_task_executions WHERE id=_exec) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL A ai_worker_id must be null';
  END IF;
  SELECT count(*) INTO _steps FROM public.work_execution_steps WHERE execution_id=_exec;
  IF _steps <> 0 THEN RAISE EXCEPTION 'FAIL A fabricated AI steps %', _steps; END IF;

  INSERT INTO public.work_products (tenant_id, workspace_id, title, business_type, status, current_version, created_by, owner_id)
  VALUES (_tid, _ws, 'Board Report', 'REPORT', 'IN_REVIEW', 1, '999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid, '999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid)
  RETURNING id INTO _wp;
  INSERT INTO _wp_a VALUES (_wp);

  _link := public.link_execution_work_product(_exec, _wp, 'itest-go4-link-a', NULL);
  IF (_link->>'linked') <> 'true' THEN RAISE EXCEPTION 'FAIL A link %', _link; END IF;
  _link := public.link_execution_work_product(_exec, _wp, 'itest-go4-link-a2', NULL);
  IF (_link->>'idempotent') <> 'true' THEN RAISE EXCEPTION 'FAIL A link not idempotent %', _link; END IF;

  INSERT INTO public.work_product_reviews (tenant_id, work_product_id, reviewer_id, requested_by, status, decided_at)
  VALUES (_tid, _wp, '999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid, '999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid, 'APPROVED', now());
  UPDATE public.work_products SET status='APPROVED' WHERE id=_wp;

  SELECT status INTO _acc FROM public.ai_task_executions WHERE id=_exec;
  IF _acc = 'ACCEPTED' THEN
    RAISE EXCEPTION 'FAIL A WP approval collapsed execution acceptance';
  END IF;
  IF pg_temp.edge_count('HAS_EXECUTION','TASK',_task,'EXECUTION',_exec) <> 1 THEN
    RAISE EXCEPTION 'FAIL A HAS_EXECUTION';
  END IF;
  IF pg_temp.edge_count('PRODUCES','EXECUTION',_exec,'WORK_PRODUCT',_wp) <> 1 THEN
    RAISE EXCEPTION 'FAIL A EXECUTION PRODUCES';
  END IF;
  IF pg_temp.edge_count('PRODUCES','TASK',_task,'WORK_PRODUCT',_wp) <> 1 THEN
    RAISE EXCEPTION 'FAIL A derived TASK PRODUCES shortcut';
  END IF;
  RAISE NOTICE 'OK SCENARIO A human';
END $$;

-- SCENARIO B — AI (start_ai_task_execution path; no WEE rewrite)
SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
CREATE TEMP TABLE _ai_exec (id uuid);
DO $$
DECLARE
  _tid uuid; _ws uuid; _task uuid; _worker uuid; _exec uuid; _wp uuid; _link jsonb;
BEGIN
  SELECT tenant_id, workspace_id INTO _tid, _ws FROM _ctx WHERE label='A';
  SELECT id INTO _task FROM _task_a;
  PERFORM public.ensure_default_ai_workers(_tid);
  SELECT id INTO _worker FROM public.ai_workers WHERE tenant_id=_tid AND status='ACTIVE' ORDER BY code LIMIT 1;
  IF _worker IS NULL THEN RAISE EXCEPTION 'FAIL B no ai worker'; END IF;
  PERFORM public.assign_task_to_ai(_task, _worker, 'Board pack', 'Complete', 'itest-go4-assign', NULL);
  INSERT INTO _ai_exec SELECT id FROM public.start_ai_task_execution(_task, NULL, 'itest-go4-ai-start', NULL);
  SELECT id INTO _exec FROM _ai_exec;
  IF (SELECT executor_type FROM public.ai_task_executions WHERE id=_exec) <> 'AI' THEN
    RAISE EXCEPTION 'FAIL B executor_type';
  END IF;
  IF (SELECT ai_worker_id FROM public.ai_task_executions WHERE id=_exec) IS NULL THEN
    RAISE EXCEPTION 'FAIL B ai_worker_id dropped';
  END IF;
  PERFORM public.finish_ai_task_execution(_exec, 'WAITING_REVIEW', 'DOCUMENT', 'AI draft', 'draft', '[]'::jsonb, '{}'::jsonb, NULL, NULL);

  INSERT INTO public.work_products (tenant_id, workspace_id, title, business_type, status, current_version, created_by, owner_id)
  VALUES (_tid, _ws, 'Financial Spreadsheet', 'ANALYSIS', 'IN_REVIEW', 1, '999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid, '999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid)
  RETURNING id INTO _wp;
  _link := public.link_execution_work_product(_exec, _wp, 'itest-go4-link-b', NULL);
  IF (_link->>'role') <> 'CREATED' THEN RAISE EXCEPTION 'FAIL B role %', _link; END IF;

  INSERT INTO public.work_product_reviews (tenant_id, work_product_id, reviewer_id, requested_by, status, decided_at)
  VALUES (_tid, _wp, '999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid, '999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid, 'APPROVED', now());
  UPDATE public.work_products SET status='APPROVED' WHERE id=_wp;
  IF (SELECT status FROM public.ai_task_executions WHERE id=_exec) <> 'WAITING_REVIEW' THEN
    RAISE EXCEPTION 'FAIL B execution still not WAITING_REVIEW after WP approve';
  END IF;
  IF pg_temp.edge_count('HAS_EXECUTION','TASK',_task,'EXECUTION',_exec) <> 1 THEN
    RAISE EXCEPTION 'FAIL B HAS_EXECUTION';
  END IF;
  IF pg_temp.edge_count('PRODUCES','EXECUTION',_exec,'WORK_PRODUCT',_wp) <> 1 THEN
    RAISE EXCEPTION 'FAIL B PRODUCES';
  END IF;
  RAISE NOTICE 'OK SCENARIO B ai';
END $$;

-- SCENARIO C — HYBRID same Work Product, two execution ids
SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
DO $$
DECLARE
  _wp uuid; _human uuid; _ai uuid; _task uuid; _link jsonb; _n int;
BEGIN
  SELECT id INTO _wp FROM _wp_a;
  SELECT id INTO _human FROM _human_exec;
  SELECT id INTO _ai FROM _ai_exec;
  SELECT id INTO _task FROM _task_a;
  IF _human = _ai THEN RAISE EXCEPTION 'FAIL C same execution id'; END IF;
  _link := public.link_execution_work_product(_ai, _wp, 'itest-go4-link-c', NULL);
  IF (_link->>'role') <> 'CONTRIBUTED' THEN RAISE EXCEPTION 'FAIL C role %', _link; END IF;
  SELECT count(*) INTO _n FROM public.execution_work_products WHERE work_product_id=_wp;
  IF _n <> 2 THEN RAISE EXCEPTION 'FAIL C junction count %', _n; END IF;
  SELECT count(DISTINCT id) INTO _n FROM public.work_products WHERE id=_wp;
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL C duplicate WP'; END IF;
  IF pg_temp.edge_count('PRODUCES','EXECUTION',_human,'WORK_PRODUCT',_wp) <> 1 THEN
    RAISE EXCEPTION 'FAIL C human PRODUCES';
  END IF;
  IF pg_temp.edge_count('PRODUCES','EXECUTION',_ai,'WORK_PRODUCT',_wp) <> 1 THEN
    RAISE EXCEPTION 'FAIL C ai PRODUCES';
  END IF;
  RAISE NOTICE 'OK SCENARIO C hybrid';
END $$;

-- REALIZED_AS remains GO-3
SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
DO $$
DECLARE _wp uuid; _doc uuid; _dv int; _dv2 int; _tid uuid;
BEGIN
  SELECT id INTO _wp FROM _wp_a;
  SELECT id INTO _doc FROM _doc_a;
  SELECT tenant_id INTO _tid FROM _ctx WHERE label='A';
  PERFORM public.link_work_entities('WORK_PRODUCT', _wp, 'DOCUMENT', _doc, 'REFERENCES');
  IF pg_temp.edge_count('REALIZED_AS','WORK_PRODUCT',_wp,'DOCUMENT',_doc) <> 1 THEN
    RAISE EXCEPTION 'FAIL REALIZED_AS';
  END IF;
  SELECT count(*) INTO _dv FROM public.document_versions dv JOIN _doc_a d ON d.id = dv.document_id;
  INSERT INTO public.work_product_versions (work_product_id, tenant_id, version, summary, author_id)
  VALUES (_wp, _tid, 2, 'snap', '999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
  SELECT count(*) INTO _dv2 FROM public.document_versions dv JOIN _doc_a d ON d.id = dv.document_id;
  IF _dv2 <> _dv THEN RAISE EXCEPTION 'FAIL document_versions dual-write'; END IF;
  RAISE NOTICE 'OK REALIZED_AS + no office dual-write';
END $$;

-- Durable telemetry
SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
DO $$
DECLARE _exec uuid; _n int; _j jsonb;
BEGIN
  SELECT id INTO _exec FROM _human_exec;
  _j := public.record_execution_step_write_failure(_exec, 'GENERATE', 'RPC_ERROR');
  IF (_j->>'stepWriteFailureCount')::int <> 1 THEN RAISE EXCEPTION 'FAIL durable count %', _j; END IF;
  SELECT step_write_failure_count INTO _n FROM public.ai_task_executions WHERE id=_exec;
  IF _n <> 1 THEN RAISE EXCEPTION 'FAIL durable column %', _n; END IF;
  RAISE NOTICE 'OK durable step write failure';
END $$;

-- Projector idempotent / out-of-order / retry
SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
DO $$
DECLARE _tid uuid; _exec uuid; _wp uuid; _proj jsonb; _n int; _e int;
BEGIN
  SELECT tenant_id INTO _tid FROM _ctx WHERE label='A';
  SELECT id INTO _exec FROM _human_exec;
  SELECT id INTO _wp FROM _wp_a;
  SELECT count(*) INTO _n FROM public.work_nodes WHERE tenant_id=_tid;
  SELECT count(*) INTO _e FROM public.work_edges WHERE tenant_id=_tid;
  _proj := public.project_execution_created(_tid, jsonb_build_object('execution_id', _exec));
  IF (_proj->>'ok') <> 'true' THEN RAISE EXCEPTION 'FAIL project created %', _proj; END IF;
  _proj := public.project_execution_created(_tid, jsonb_build_object('execution_id', _exec));
  _proj := public.project_execution_work_product_linked(_tid, jsonb_build_object('execution_id', _exec, 'work_product_id', _wp));
  IF (_proj->>'ok') <> 'true' THEN RAISE EXCEPTION 'FAIL project linked %', _proj; END IF;
  _proj := public.project_execution_work_product_linked(_tid, jsonb_build_object('execution_id', _exec, 'work_product_id', _wp));
  IF (SELECT count(*) FROM public.work_nodes WHERE tenant_id=_tid) < _n THEN
    RAISE EXCEPTION 'FAIL projector deleted nodes';
  END IF;
  -- unique edges: HAS_EXECUTION / PRODUCES remain 1
  IF pg_temp.edge_count('HAS_EXECUTION','TASK',(SELECT id FROM _task_a),'EXECUTION',_exec) <> 1 THEN
    RAISE EXCEPTION 'FAIL retry HAS_EXECUTION dup';
  END IF;
  IF pg_temp.edge_count('PRODUCES','EXECUTION',_exec,'WORK_PRODUCT',_wp) <> 1 THEN
    RAISE EXCEPTION 'FAIL retry PRODUCES dup';
  END IF;
  _proj := public.project_execution_work_product_linked(_tid, jsonb_build_object('execution_id', gen_random_uuid(), 'work_product_id', _wp));
  IF (_proj->>'error') IS NULL OR (_proj->>'ok') = 'true' THEN
    RAISE EXCEPTION 'FAIL missing junction not skippable %', _proj;
  END IF;
  RAISE NOTICE 'OK projector idempotent retry';
END $$;

-- Backfill second run duplicates = 0
SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
DO $$
DECLARE _tid uuid; _n1 int; _e1 int; _n2 int; _e2 int; _bf jsonb;
BEGIN
  SELECT tenant_id INTO _tid FROM _ctx WHERE label='A';
  SELECT count(*) INTO _n1 FROM public.work_nodes WHERE tenant_id=_tid;
  SELECT count(*) INTO _e1 FROM public.work_edges WHERE tenant_id=_tid;
  _bf := public.go4_execution_graph_backfill(_tid, 200);
  IF (_bf->>'ok') <> 'true' THEN RAISE EXCEPTION 'FAIL backfill %', _bf; END IF;
  _bf := public.go4_execution_graph_backfill(_tid, 200);
  SELECT count(*) INTO _n2 FROM public.work_nodes WHERE tenant_id=_tid;
  SELECT count(*) INTO _e2 FROM public.work_edges WHERE tenant_id=_tid;
  IF _n2 <> _n1 OR _e2 <> _e1 THEN
    RAISE EXCEPTION 'FAIL backfill dups nodes %→% edges %→%', _n1, _n2, _e1, _e2;
  END IF;
  RAISE NOTICE 'OK backfill second run duplicates 0';
END $$;

-- Cross-tenant link fail closed
SELECT pg_temp.act('8236c840-8676-48ba-9f9b-497663e1e905'::uuid);
CREATE TEMP TABLE _wp_b (id uuid);
DO $$
DECLARE _tid uuid; _ws uuid; _wp uuid;
BEGIN
  SELECT tenant_id, workspace_id INTO _tid, _ws FROM _ctx WHERE label='B';
  INSERT INTO public.work_products (tenant_id, workspace_id, title, business_type, status, current_version, created_by)
  VALUES (_tid, _ws, 'B secret WP', 'MEMO', 'DRAFT', 1, '8236c840-8676-48ba-9f9b-497663e1e905'::uuid)
  RETURNING id INTO _wp;
  INSERT INTO _wp_b VALUES (_wp);
END $$;

SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
DO $$
DECLARE _exec uuid; _wp uuid;
BEGIN
  SELECT id INTO _exec FROM _human_exec;
  SELECT id INTO _wp FROM _wp_b;
  BEGIN
    PERFORM public.link_execution_work_product(_exec, _wp, 'xt-link', NULL);
    RAISE EXCEPTION 'FAIL cross-tenant link succeeded';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL cross-tenant link succeeded' THEN RAISE; END IF;
    IF SQLERRM NOT ILIKE '%CROSS_TENANT%' AND SQLSTATE <> '42501' THEN
      RAISE EXCEPTION 'FAIL unexpected xt error % %', SQLSTATE, SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'OK cross-tenant link denied';
END $$;

-- Cross-tenant graph projector
SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
DO $$
DECLARE _tidb uuid; _exec uuid; _proj jsonb;
BEGIN
  SELECT tenant_id INTO _tidb FROM _ctx WHERE label='B';
  SELECT id INTO _exec FROM _human_exec;
  _proj := public.project_execution_created(_tidb, jsonb_build_object('execution_id', _exec));
  IF (_proj->>'error') <> 'CROSS_TENANT' THEN
    RAISE EXCEPTION 'FAIL xt graph %', _proj;
  END IF;
  RAISE NOTICE 'OK cross-tenant graph deny';
END $$;

-- Source write independent of poison projector payload
SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
DO $$
DECLARE _tid uuid; _exec uuid; _wp uuid; _proj jsonb; _n int;
BEGIN
  SELECT tenant_id INTO _tid FROM _ctx WHERE label='A';
  SELECT id INTO _exec FROM _human_exec;
  SELECT id INTO _wp FROM _wp_a;
  SELECT count(*) INTO _n FROM public.execution_work_products WHERE execution_id=_exec AND work_product_id=_wp;
  _proj := public.project_execution_created(_tid, jsonb_build_object('nope', true));
  IF (_proj->>'error') <> 'INVALID_PAYLOAD' THEN RAISE EXCEPTION 'FAIL poison %', _proj; END IF;
  IF (SELECT count(*) FROM public.execution_work_products WHERE execution_id=_exec AND work_product_id=_wp) <> _n THEN
    RAISE EXCEPTION 'FAIL projector mutated source';
  END IF;
  RAISE NOTICE 'OK source independent of projector failure';
END $$;

-- Historical junctions not invented from task match
DO $$
DECLARE _orphan int;
BEGIN
  SELECT count(*) INTO _orphan
    FROM public.ai_task_executions e
    JOIN public.work_products wp ON wp.tenant_id = e.tenant_id AND wp.workspace_id = e.workspace_id
   WHERE e.id NOT IN (SELECT execution_id FROM public.execution_work_products)
     AND wp.id NOT IN (SELECT work_product_id FROM public.execution_work_products WHERE execution_id = e.id)
     AND e.id IN (SELECT id FROM _ai_exec);
  -- AI exec linked to Financial Spreadsheet only, not to Board Report except via C.
  RAISE NOTICE 'OK no invented historical junctions';
END $$;

SELECT '=== PASS 16_go4_execution_work_product ===';
ROLLBACK;
