-- GO-3 Option B: Work Product + Document work graph (three-authority model).
-- Source tables remain SSOT. Graph is derived and rebuildable.
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

CREATE OR REPLACE FUNCTION pg_temp.doc_latest(_doc uuid)
RETURNS bigint LANGUAGE sql AS $$
  SELECT COALESCE((metadata->>'latestVersion')::bigint, 0)
    FROM public.work_nodes WHERE entity_type = 'DOCUMENT' AND entity_id = _doc
$$;

CREATE OR REPLACE FUNCTION pg_temp.wp_latest(_wp uuid)
RETURNS bigint LANGUAGE sql AS $$
  SELECT COALESCE((metadata->>'latestBusinessVersion')::bigint, 0)
    FROM public.work_nodes WHERE entity_type = 'WORK_PRODUCT' AND entity_id = _wp
$$;

SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
CREATE TEMP TABLE _t AS
SELECT * FROM public.provision_tenant(
  'itest_go3b_A', 'itest-go3b-a-'||substr(md5(random()::text),1,10), '999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid, 'GO3B-A');

SELECT pg_temp.act('8236c840-8676-48ba-9f9b-497663e1e905'::uuid);
INSERT INTO _t
SELECT * FROM public.provision_tenant(
  'itest_go3b_B', 'itest-go3b-b-'||substr(md5(random()::text),1,10), '8236c840-8676-48ba-9f9b-497663e1e905'::uuid, 'GO3B-B');

CREATE TEMP TABLE _ctx (label text, tenant_id uuid, workspace_id uuid);
INSERT INTO _ctx SELECT 'A', tenant_id, workspace_id FROM _t OFFSET 0 LIMIT 1;
INSERT INTO _ctx SELECT 'B', tenant_id, workspace_id FROM _t OFFSET 1 LIMIT 1;

SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
SELECT public._test_seed_entitlement(tenant_id, 'tasks.active', true, 100) FROM _ctx WHERE label='A';
SELECT public._test_seed_entitlement(tenant_id, 'meetings.scheduled_per_month', true, 20) FROM _ctx WHERE label='A';
SELECT public._test_seed_entitlement(tenant_id, 'documents.storage_bytes', true, NULL) FROM _ctx WHERE label='A';
SELECT pg_temp.act('8236c840-8676-48ba-9f9b-497663e1e905'::uuid);
SELECT public._test_seed_entitlement(tenant_id, 'tasks.active', true, 100) FROM _ctx WHERE label='B';
SELECT public._test_seed_entitlement(tenant_id, 'documents.storage_bytes', true, NULL) FROM _ctx WHERE label='B';

-- 0. three authorities exist and are not merged
DO $$
BEGIN
  IF to_regclass('public.documents') IS NULL OR to_regclass('public.document_versions') IS NULL THEN
    RAISE EXCEPTION 'FAIL schema: documents SSOT missing';
  END IF;
  IF to_regclass('public.work_units') IS NULL THEN
    RAISE EXCEPTION 'FAIL schema: work_units catalog missing';
  END IF;
  IF to_regclass('public.work_products') IS NULL THEN
    RAISE EXCEPTION 'FAIL schema: work_products missing (zip fixture or live MVP)';
  END IF;
  IF to_regclass('public.work_products_v2') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL schema: work_products_v2 must not exist';
  END IF;
  RAISE NOTICE 'OK three-authority tables present';
END $$;

SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
CREATE TEMP TABLE _doc_a AS
SELECT * FROM public.create_document(
  (SELECT workspace_id FROM _ctx WHERE label='A'),
  'ACME Proposal.docx',
  'My Documents', '{}'::text[],
  jsonb_build_object('provider','supabase','bucket','documents','objectKey',
    (SELECT workspace_id::text FROM _ctx WHERE label='A') || '/go3b/ACME-Proposal.docx'),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  12
);

CREATE TEMP TABLE _task_a AS
SELECT * FROM public.create_task(
  (SELECT workspace_id FROM _ctx WHERE label='A'),
  'Prepare ACME Proposal', NULL, 'normal', NULL, NULL,
  'itest-go3b-taskA', NULL);

SELECT pg_temp.act('8236c840-8676-48ba-9f9b-497663e1e905'::uuid);
CREATE TEMP TABLE _doc_b AS
SELECT * FROM public.create_document(
  (SELECT workspace_id FROM _ctx WHERE label='B'), 'B-only');
CREATE TEMP TABLE _task_b AS
SELECT * FROM public.create_task(
  (SELECT workspace_id FROM _ctx WHERE label='B'),
  'B task', NULL, 'normal', NULL, NULL, 'itest-go3b-taskB', NULL);

-- CASE A: Task → DOCUMENT attachment only. No fabricated Work Product.
SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
DO $$
DECLARE _doc uuid; _task uuid; _r jsonb; _wp int;
BEGIN
  SELECT id INTO _doc FROM _doc_a;
  SELECT id INTO _task FROM _task_a;
  IF pg_temp.node_count('DOCUMENT', _doc) <> 1 THEN
    RAISE EXCEPTION 'FAIL DOCUMENT node %', pg_temp.node_count('DOCUMENT', _doc);
  END IF;
  IF (SELECT metadata->>'semanticType' FROM public.work_nodes
       WHERE entity_type='DOCUMENT' AND entity_id=_doc) = 'WORK_PRODUCT' THEN
    RAISE EXCEPTION 'FAIL DOCUMENT stamped as WORK_PRODUCT';
  END IF;
  _r := public.link_work_entities('DOCUMENT', _doc, 'TASK', _task, 'ATTACHED_TO');
  IF (_r->>'edgeId') IS NULL THEN RAISE EXCEPTION 'FAIL attach %', _r; END IF;
  SELECT count(*) INTO _wp FROM public.work_nodes WHERE entity_type='WORK_PRODUCT' AND entity_id=_doc;
  IF _wp <> 0 THEN RAISE EXCEPTION 'FAIL fabricated WP from document id'; END IF;
  IF pg_temp.edge_count('PRODUCES','TASK',_task,'WORK_PRODUCT',_doc) <> 0 THEN
    RAISE EXCEPTION 'FAIL fabricated PRODUCES WP from attach';
  END IF;
  IF pg_temp.edge_count('ATTACHED_TO','DOCUMENT',_doc,'TASK',_task) <> 1 THEN
    RAISE EXCEPTION 'FAIL CASE A attach missing';
  END IF;
  RAISE NOTICE 'OK CASE A task-document only';
END $$;

-- CASE B: Task → Work Product only. No fabricated Document.
SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
CREATE TEMP TABLE _wp_b (id uuid);
DO $$
DECLARE _tid uuid; _ws uuid; _wp uuid; _task uuid;
BEGIN
  SELECT tenant_id, workspace_id INTO _tid, _ws FROM _ctx WHERE label='A';
  SELECT id INTO _task FROM _task_a;
  INSERT INTO public.work_products (tenant_id, workspace_id, title, business_type, status, current_version, created_by)
  VALUES (_tid, _ws, 'ACME Enterprise Proposal', 'PROPOSAL', 'IN_REVIEW', 1, '999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid)
  RETURNING id INTO _wp;
  INSERT INTO _wp_b VALUES (_wp);
  PERFORM public.project_work_product_upserted(_tid, jsonb_build_object('work_product_id', _wp));
  IF pg_temp.node_count('WORK_PRODUCT', _wp) <> 1 THEN
    RAISE EXCEPTION 'FAIL WP node %', pg_temp.node_count('WORK_PRODUCT', _wp);
  END IF;
  IF pg_temp.node_count('DOCUMENT', _wp) <> 0 THEN
    RAISE EXCEPTION 'FAIL fabricated DOCUMENT for WP id';
  END IF;
  PERFORM public.link_work_entities('WORK_PRODUCT', _wp, 'TASK', _task, 'REFERENCES');
  IF pg_temp.edge_count('PRODUCES','TASK',_task,'WORK_PRODUCT',_wp) <> 1 THEN
    RAISE EXCEPTION 'FAIL CASE B PRODUCES';
  END IF;
  IF pg_temp.edge_count('REALIZED_AS','WORK_PRODUCT',_wp,'DOCUMENT',_wp) <> 0 THEN
    RAISE EXCEPTION 'FAIL fabricated REALIZED_AS';
  END IF;
  RAISE NOTICE 'OK CASE B task-work product only';
END $$;

-- CASE C: Task → WP → REALIZED_AS → Document
SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
DO $$
DECLARE _wp uuid; _doc uuid; _task uuid; _tid uuid; _dv int; _dv2 int;
BEGIN
  SELECT id INTO _wp FROM _wp_b;
  SELECT id INTO _doc FROM _doc_a;
  SELECT id INTO _task FROM _task_a;
  SELECT tenant_id INTO _tid FROM _ctx WHERE label='A';
  PERFORM public.link_work_entities('WORK_PRODUCT', _wp, 'DOCUMENT', _doc, 'REFERENCES');
  IF pg_temp.edge_count('REALIZED_AS','WORK_PRODUCT',_wp,'DOCUMENT',_doc) <> 1 THEN
    RAISE EXCEPTION 'FAIL CASE C REALIZED_AS';
  END IF;
  IF pg_temp.edge_count('PRODUCES','TASK',_task,'WORK_PRODUCT',_wp) <> 1 THEN
    RAISE EXCEPTION 'FAIL CASE C PRODUCES';
  END IF;
  -- WP version insert must not create document_versions
  SELECT count(*) INTO _dv FROM public.document_versions dv JOIN _doc_a d ON d.id = dv.document_id;
  INSERT INTO public.work_product_versions (work_product_id, tenant_id, version, summary, author_id)
  VALUES (_wp, _tid, 2, 'Business snapshot', '999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
  SELECT count(*) INTO _dv2 FROM public.document_versions dv JOIN _doc_a d ON d.id = dv.document_id;
  IF _dv2 <> _dv THEN
    RAISE EXCEPTION 'FAIL WP version dual-wrote document_versions %→%', _dv, _dv2;
  END IF;
  RAISE NOTICE 'OK CASE C realized_as + version separation';
END $$;

-- Document latestVersion monotonic / out of order / idempotent
SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
DO $$
DECLARE _id uuid; _tid uuid; _n int; _e int; _proj jsonb;
BEGIN
  SELECT id INTO _id FROM _doc_a;
  SELECT tenant_id INTO _tid FROM _ctx WHERE label='A';
  _proj := public.project_document_version_uploaded(_tid, jsonb_build_object('document_id', _id, 'version', 5));
  IF (_proj->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL project v5 %', _proj; END IF;
  IF (_proj ? 'workProductId') AND (_proj->>'workProductId') = _id::text THEN
    RAISE EXCEPTION 'FAIL document projector aliased WP id';
  END IF;
  IF pg_temp.doc_latest(_id) <> 5 THEN RAISE EXCEPTION 'FAIL latest 5 got %', pg_temp.doc_latest(_id); END IF;
  _proj := public.project_document_version_uploaded(_tid, jsonb_build_object('document_id', _id, 'version', 4));
  IF pg_temp.doc_latest(_id) <> 5 THEN RAISE EXCEPTION 'FAIL regression to 4'; END IF;
  SELECT count(*) INTO _n FROM public.work_nodes WHERE entity_type='DOCUMENT' AND entity_id=_id;
  SELECT count(*) INTO _e FROM public.work_edges e
    JOIN public.work_nodes n ON n.id IN (e.source_node_id, e.target_node_id)
   WHERE n.entity_type='DOCUMENT' AND n.entity_id=_id;
  PERFORM public.project_document_version_uploaded(_tid, jsonb_build_object('document_id', _id, 'version', 5));
  IF pg_temp.node_count('DOCUMENT', _id) <> _n THEN RAISE EXCEPTION 'FAIL retry nodes'; END IF;
  IF (
    SELECT count(*) FROM public.work_edges e
      JOIN public.work_nodes n ON n.id IN (e.source_node_id, e.target_node_id)
     WHERE n.entity_type='DOCUMENT' AND n.entity_id=_id
  ) <> _e THEN RAISE EXCEPTION 'FAIL retry edges'; END IF;
  RAISE NOTICE 'OK document latestVersion monotonic + idempotent';
END $$;

-- WP projector idempotent + out of order business version
SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
DO $$
DECLARE _wp uuid; _tid uuid; _n int; _proj jsonb;
BEGIN
  SELECT id INTO _wp FROM _wp_b;
  SELECT tenant_id INTO _tid FROM _ctx WHERE label='A';
  _proj := public.project_work_product_upserted(_tid, jsonb_build_object('work_product_id', _wp, 'version', 9));
  IF (_proj->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL wp project %', _proj; END IF;
  IF pg_temp.wp_latest(_wp) < 9 THEN RAISE EXCEPTION 'FAIL wp latest %', pg_temp.wp_latest(_wp); END IF;
  PERFORM public.project_work_product_upserted(_tid, jsonb_build_object('work_product_id', _wp, 'version', 3));
  IF pg_temp.wp_latest(_wp) < 9 THEN RAISE EXCEPTION 'FAIL wp version regression'; END IF;
  SELECT count(*) INTO _n FROM public.work_nodes WHERE entity_type='WORK_PRODUCT' AND entity_id=_wp;
  PERFORM public.project_work_product_upserted(_tid, jsonb_build_object('work_product_id', _wp, 'version', 9));
  IF pg_temp.node_count('WORK_PRODUCT', _wp) <> _n THEN RAISE EXCEPTION 'FAIL wp retry nodes'; END IF;
  RAISE NOTICE 'OK work product projector idempotent';
END $$;

-- Cross-tenant: skip, no edge
SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
DO $$
DECLARE _wp uuid; _docb uuid; _tida uuid; _tidb uuid; _proj jsonb; _before int;
BEGIN
  SELECT id INTO _wp FROM _wp_b;
  SELECT id INTO _docb FROM _doc_b;
  SELECT tenant_id INTO _tida FROM _ctx WHERE label='A';
  SELECT tenant_id INTO _tidb FROM _ctx WHERE label='B';
  _proj := public.project_document_version_uploaded(_tida, jsonb_build_object('document_id', _docb, 'version', 1));
  IF COALESCE(_proj->>'error','') <> 'CROSS_TENANT' THEN
    RAISE EXCEPTION 'FAIL expected CROSS_TENANT got %', _proj;
  END IF;
  SELECT count(*) INTO _before FROM public.work_edges e
    JOIN public.work_nodes s ON s.id=e.source_node_id
    JOIN public.work_nodes t ON t.id=e.target_node_id
   WHERE s.entity_id=_wp AND t.entity_id=_docb;
  PERFORM public._go3_project_user_wp_link('WORK_PRODUCT', _wp, 'DOCUMENT', _docb, 'REFERENCES');
  IF (
    SELECT count(*) FROM public.work_edges e
      JOIN public.work_nodes s ON s.id=e.source_node_id
      JOIN public.work_nodes t ON t.id=e.target_node_id
     WHERE s.entity_id=_wp AND t.entity_id=_docb
  ) <> _before THEN
    RAISE EXCEPTION 'FAIL cross-tenant REALIZED_AS created';
  END IF;
  RAISE NOTICE 'OK cross-tenant deny';
END $$;

-- Graph failure does not corrupt source
SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
DO $$
DECLARE _wp uuid; _tid uuid; _title text; _proj jsonb;
BEGIN
  SELECT id INTO _wp FROM _wp_b;
  SELECT tenant_id INTO _tid FROM _ctx WHERE label='A';
  SELECT title INTO _title FROM public.work_products WHERE id=_wp;
  _proj := public.project_work_product_upserted(_tid, jsonb_build_object('work_product_id', gen_random_uuid()));
  IF COALESCE(_proj->>'error','') <> 'NOT_FOUND' THEN
    RAISE EXCEPTION 'FAIL expected NOT_FOUND %', _proj;
  END IF;
  IF (SELECT title FROM public.work_products WHERE id=_wp) IS DISTINCT FROM _title THEN
    RAISE EXCEPTION 'FAIL source corrupted';
  END IF;
  _proj := public.project_work_product_upserted(_tid, jsonb_build_object('work_product_id', _wp));
  IF (_proj->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL retry recover %', _proj; END IF;
  RAISE NOTICE 'OK graph failure independent + retry';
END $$;

-- Backfill twice: 0 duplicate nodes/edges
SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
DO $$
DECLARE _tid uuid; _n1 int; _e1 int; _n2 int; _e2 int; _r jsonb;
BEGIN
  SELECT tenant_id INTO _tid FROM _ctx WHERE label='A';
  SELECT count(*) INTO _n1 FROM public.work_nodes WHERE tenant_id=_tid;
  SELECT count(*) INTO _e1 FROM public.work_edges WHERE tenant_id=_tid;
  _r := public.go3_work_graph_backfill(_tid, 500);
  IF (_r->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL backfill %', _r; END IF;
  SELECT count(*) INTO _n2 FROM public.work_nodes WHERE tenant_id=_tid;
  SELECT count(*) INTO _e2 FROM public.work_edges WHERE tenant_id=_tid;
  _r := public.go3_work_graph_backfill(_tid, 500);
  IF (SELECT count(*) FROM public.work_nodes WHERE tenant_id=_tid) <> _n2 THEN
    RAISE EXCEPTION 'FAIL backfill second-run nodes';
  END IF;
  IF (SELECT count(*) FROM public.work_edges WHERE tenant_id=_tid) <> _e2 THEN
    RAISE EXCEPTION 'FAIL backfill second-run edges';
  END IF;
  RAISE NOTICE 'OK backfill idempotent (nodes %→% edges %→%)', _n1, _n2, _e1, _e2;
END $$;

-- Meeting → DOCUMENT attach preserved; meeting artifact is not a WP
SELECT pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
CREATE TEMP TABLE _meet_a AS
SELECT * FROM public.schedule_meeting(
  (SELECT workspace_id FROM _ctx WHERE label='A'),
  'Q4 Strategy', now() + interval '2 day', now() + interval '2 day 30 min',
  NULL, 'UTC', NULL, NULL, NULL, 'itest-go3b-meet', NULL);
DO $$
DECLARE _doc uuid; _meet uuid; _wp uuid;
BEGIN
  SELECT id INTO _doc FROM _doc_a;
  SELECT id INTO _meet FROM _meet_a;
  SELECT id INTO _wp FROM _wp_b;
  PERFORM public.link_work_entities('DOCUMENT', _doc, 'MEETING', _meet, 'ATTACHED_TO');
  IF pg_temp.edge_count('ATTACHED_TO','DOCUMENT',_doc,'MEETING',_meet) <> 1 THEN
    RAISE EXCEPTION 'FAIL meeting document attach';
  END IF;
  PERFORM public.link_work_entities('WORK_PRODUCT', _wp, 'MEETING', _meet, 'REFERENCES');
  IF pg_temp.edge_count('PRODUCES','MEETING',_meet,'WORK_PRODUCT',_wp) <> 1 THEN
    RAISE EXCEPTION 'FAIL meeting PRODUCES WP';
  END IF;
  RAISE NOTICE 'OK meeting document + work product relations';
END $$;

-- AI execution has no document_id — blocked by source model
DO $$
DECLARE _has int;
BEGIN
  SELECT count(*) INTO _has FROM information_schema.columns
   WHERE table_schema='public' AND table_name='ai_task_executions' AND column_name='document_id';
  IF _has <> 0 THEN
    RAISE EXCEPTION 'FAIL AI source model changed unexpectedly';
  END IF;
  RAISE NOTICE 'OK AI_EXECUTION blocked by source model';
END $$;

-- Office save if GO-2C RPCs exist: document_versions +1, no WP version dual-write
DO $$
DECLARE
  _doc uuid; _wp uuid; _sess jsonb; _ex jsonb; _sid uuid; _base uuid;
  _op uuid := gen_random_uuid();
  _sum text := 'e14b307d1782a7baf612336b3839947a79e2764b28ad3fa7237bed749b7386bc';
  _r jsonb; _dv int; _wpv int; _dv2 int; _wpv2 int;
BEGIN
  IF to_regprocedure('public.office_create_session(uuid,text,timestamptz)') IS NULL THEN
    RAISE NOTICE 'SKIP office save — GO-2C RPCs not on this database';
    RETURN;
  END IF;
  SELECT id INTO _doc FROM _doc_a;
  SELECT id INTO _wp FROM _wp_b;
  SELECT count(*) INTO _dv FROM public.document_versions WHERE document_id=_doc;
  SELECT count(*) INTO _wpv FROM public.work_product_versions WHERE work_product_id=_wp;
  PERFORM pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
  _sess := public.office_create_session(_doc, repeat('c',64), now() + interval '3 minutes');
  _sid := (_sess->>'sessionId')::uuid;
  _ex := public.office_exchange_launch(repeat('c',64), repeat('d',64), now() + interval '8 hours');
  _base := (_ex->'descriptor'->>'versionId')::uuid;
  PERFORM public.office_save_prepare(_sid, repeat('d',64), _op, _base,
    'application/octet-stream', 12, _sum);
  PERFORM public.office_save_mark_uploaded(_sid, repeat('d',64), _op, _sum, 12);
  _r := public.office_save_complete(_sid, repeat('d',64), _op, _sum, 'itest-go3b');
  SELECT count(*) INTO _dv2 FROM public.document_versions WHERE document_id=_doc;
  SELECT count(*) INTO _wpv2 FROM public.work_product_versions WHERE work_product_id=_wp;
  IF _dv2 <> _dv + 1 THEN RAISE EXCEPTION 'FAIL office document_versions %→%', _dv, _dv2; END IF;
  IF _wpv2 <> _wpv THEN RAISE EXCEPTION 'FAIL office dual-wrote work_product_versions %→%', _wpv, _wpv2; END IF;
  RAISE NOTICE 'OK office save single writer';
END $$;

SELECT '=== PASS 15_go3_option_b_work_graph ===';
ROLLBACK;
