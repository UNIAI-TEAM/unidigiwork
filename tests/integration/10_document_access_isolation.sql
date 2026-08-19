-- ==========================================================================
-- Integration test: document access isolation (tenant + workspace + shares)
-- Verifies a user only sees documents of their own tenant/workspace, or
-- documents explicitly shared with them, and cannot escalate via RPC.
-- ==========================================================================
\ir _helpers.sql

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.act(_uid uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', _uid::text, 'role', 'authenticated')::text, true)::void;
$$;

-- ---- setup: two isolated tenants ------------------------------------------
SELECT pg_temp.act(:OWNER_A::uuid);
CREATE TEMP TABLE _t AS
SELECT * FROM public.provision_tenant(
  'itest_doc_A', 'itest-doc-a-'||substr(md5(random()::text),1,10), :OWNER_A::uuid, 'WS-A');

SELECT pg_temp.act(:OWNER_B::uuid);
INSERT INTO _t
SELECT * FROM public.provision_tenant(
  'itest_doc_B', 'itest-doc-b-'||substr(md5(random()::text),1,10), :OWNER_B::uuid, 'WS-B');

CREATE TEMP TABLE _ctx (label text, tenant_id uuid, workspace_id uuid);
INSERT INTO _ctx SELECT 'A', tenant_id, workspace_id FROM _t OFFSET 0 LIMIT 1;
INSERT INTO _ctx SELECT 'B', tenant_id, workspace_id FROM _t OFFSET 1 LIMIT 1;

-- documents: one in each tenant
SELECT pg_temp.act(:OWNER_A::uuid);
CREATE TEMP TABLE _doc_a AS
SELECT * FROM public.create_document(
  (SELECT workspace_id FROM _ctx WHERE label='A'), 'doc-in-A');

SELECT pg_temp.act(:OWNER_B::uuid);
CREATE TEMP TABLE _doc_b AS
SELECT * FROM public.create_document(
  (SELECT workspace_id FROM _ctx WHERE label='B'), 'doc-in-B');

-- ---- 1: owner A sees own document, not tenant B's -------------------------
DO $$
DECLARE _a uuid := (SELECT id FROM _doc_a); _b uuid := (SELECT id FROM _doc_b);
BEGIN
  PERFORM pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
  IF NOT public.can_access_document(_a) THEN
    RAISE EXCEPTION 'FAIL doc-own: owner A cannot read own document';
  END IF;
  IF public.can_access_document(_b) THEN
    RAISE EXCEPTION 'FAIL doc-cross-tenant: owner A can read tenant B document';
  END IF;
  RAISE NOTICE 'OK doc-own / doc-cross-tenant';
END $$;

-- ---- 2: owner B cannot read tenant A document -----------------------------
DO $$
DECLARE _a uuid := (SELECT id FROM _doc_a);
BEGIN
  PERFORM pg_temp.act('8236c840-8676-48ba-9f9b-497663e1e905'::uuid);
  IF public.can_access_document(_a) THEN
    RAISE EXCEPTION 'FAIL doc-foreign: owner B can read tenant A document';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.documents d
     WHERE d.tenant_id = (SELECT tenant_id FROM _ctx WHERE label='A')
       AND public.can_access_document(d.id)
  ) THEN
    RAISE EXCEPTION 'FAIL doc-list: owner B lists tenant A documents';
  END IF;
  RAISE NOTICE 'OK doc-foreign / doc-list';
END $$;

-- ---- 3: tenant member of A but NOT workspace member still has no access ---
INSERT INTO public.tenant_members (tenant_id, user_id, role, status)
VALUES ((SELECT tenant_id FROM _ctx WHERE label='A'), :OWNER_B::uuid, 'member', 'active')
ON CONFLICT (tenant_id, user_id) DO UPDATE SET status='active';

DO $$
DECLARE _a uuid := (SELECT id FROM _doc_a);
BEGIN
  PERFORM pg_temp.act('8236c840-8676-48ba-9f9b-497663e1e905'::uuid);
  IF public.can_access_document(_a) THEN
    RAISE EXCEPTION 'FAIL doc-tenant-only: tenant member (non-workspace) can read document';
  END IF;
  RAISE NOTICE 'OK doc-tenant-only: tenant membership alone grants no document access';
END $$;

-- ---- 4: non-manager cannot share or revoke --------------------------------
DO $$
DECLARE _a uuid := (SELECT id FROM _doc_a); _err text;
BEGIN
  PERFORM pg_temp.act('8236c840-8676-48ba-9f9b-497663e1e905'::uuid);
  BEGIN
    PERFORM public.share_document(_a, 'user', '8236c840-8676-48ba-9f9b-497663e1e905'::uuid, 'edit');
    RAISE EXCEPTION 'FAIL doc-share-escalation: non-manager shared document to self';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    _err := SQLERRM;
    IF _err !~ 'DOCUMENT_SHARE_FORBIDDEN' THEN
      RAISE EXCEPTION 'FAIL doc-share-escalation: unexpected error %', _err;
    END IF;
    RAISE NOTICE 'OK doc-share-escalation: % ', _err;
  END;
END $$;

-- ---- 5: cross-tenant principals rejected ----------------------------------
DO $$
DECLARE _a uuid := (SELECT id FROM _doc_a);
        _wsB uuid := (SELECT workspace_id FROM _ctx WHERE label='B');
        _tB uuid := (SELECT tenant_id FROM _ctx WHERE label='B');
BEGIN
  PERFORM pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
  BEGIN
    PERFORM public.share_document(_a, 'workspace', _wsB, 'view');
    RAISE EXCEPTION 'FAIL doc-share-foreign-ws: shared tenant A doc with tenant B workspace';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM !~ 'PRINCIPAL_NOT_IN_TENANT' THEN
      RAISE EXCEPTION 'FAIL doc-share-foreign-ws: unexpected error %', SQLERRM;
    END IF;
  END;
  BEGIN
    PERFORM public.share_document(_a, 'tenant', _tB, 'view');
    RAISE EXCEPTION 'FAIL doc-share-foreign-tenant: shared tenant A doc with tenant B';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF SQLERRM !~ 'PRINCIPAL_NOT_IN_TENANT' THEN
      RAISE EXCEPTION 'FAIL doc-share-foreign-tenant: unexpected error %', SQLERRM;
    END IF;
  END;
  RAISE NOTICE 'OK doc-share-foreign: cross-tenant principals rejected';
END $$;

-- ---- 6: explicit user share grants access, revoke removes it --------------
DO $$
DECLARE _a uuid := (SELECT id FROM _doc_a);
BEGIN
  PERFORM pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
  PERFORM public.share_document(_a, 'user', '8236c840-8676-48ba-9f9b-497663e1e905'::uuid, 'view');

  PERFORM pg_temp.act('8236c840-8676-48ba-9f9b-497663e1e905'::uuid);
  IF NOT public.can_access_document(_a) THEN
    RAISE EXCEPTION 'FAIL doc-share-grant: grantee still cannot read shared document';
  END IF;
  -- grantee (view level) must not be able to revoke
  BEGIN
    PERFORM public.revoke_document_share(_a, 'user', '8236c840-8676-48ba-9f9b-497663e1e905'::uuid);
    RAISE EXCEPTION 'FAIL doc-revoke-escalation: view-level grantee revoked a share';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;

  PERFORM pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
  IF NOT public.revoke_document_share(_a, 'user', '8236c840-8676-48ba-9f9b-497663e1e905'::uuid) THEN
    RAISE EXCEPTION 'FAIL doc-revoke: owner revoke returned false';
  END IF;

  PERFORM pg_temp.act('8236c840-8676-48ba-9f9b-497663e1e905'::uuid);
  IF public.can_access_document(_a) THEN
    RAISE EXCEPTION 'FAIL doc-revoke: access persists after revoke';
  END IF;
  RAISE NOTICE 'OK doc-share-grant / doc-revoke';
END $$;

-- ---- 7: tenant-wide share is scoped to that tenant only -------------------
DO $$
DECLARE _a uuid := (SELECT id FROM _doc_a); _tA uuid := (SELECT tenant_id FROM _ctx WHERE label='A');
BEGIN
  PERFORM pg_temp.act('999a12c6-85b6-4327-8469-b91fc7a8e765'::uuid);
  PERFORM public.share_document(_a, 'tenant', _tA, 'view');

  PERFORM pg_temp.act('8236c840-8676-48ba-9f9b-497663e1e905'::uuid);
  IF NOT public.can_access_document(_a) THEN
    RAISE EXCEPTION 'FAIL doc-share-tenant: tenant member cannot read tenant-shared document';
  END IF;

  -- remove membership in tenant A -> access must disappear
  UPDATE public.tenant_members SET status = 'removed'
   WHERE tenant_id = _tA AND user_id = '8236c840-8676-48ba-9f9b-497663e1e905'::uuid;
  IF public.can_access_document(_a) THEN
    RAISE EXCEPTION 'FAIL doc-share-tenant: removed member still reads tenant-shared document';
  END IF;
  RAISE NOTICE 'OK doc-share-tenant: scoped to active tenant membership';
END $$;

-- ---- 8: versions & permissions rows follow document access ----------------
DO $$
DECLARE _a uuid := (SELECT id FROM _doc_a);
BEGIN
  PERFORM pg_temp.act('8236c840-8676-48ba-9f9b-497663e1e905'::uuid);
  IF EXISTS (SELECT 1 FROM public.document_versions v
              WHERE v.document_id = _a AND public.can_access_document(v.document_id)) THEN
    RAISE EXCEPTION 'FAIL doc-versions: outsider can read versions of tenant A document';
  END IF;
  IF EXISTS (SELECT 1 FROM public.document_permissions p
              WHERE p.document_id = _a AND public.can_access_document(p.document_id)) THEN
    RAISE EXCEPTION 'FAIL doc-permissions: outsider can read permission rows of tenant A document';
  END IF;
  RAISE NOTICE 'OK doc-versions / doc-permissions gated by can_access_document';
END $$;

-- ---- 9: unauthenticated caller sees nothing -------------------------------
DO $$
DECLARE _a uuid := (SELECT id FROM _doc_a);
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  IF public.can_access_document(_a) THEN
    RAISE EXCEPTION 'FAIL doc-anon: anonymous caller can read a document';
  END IF;
  BEGIN
    PERFORM public.share_document(_a, 'user', '8236c840-8676-48ba-9f9b-497663e1e905'::uuid, 'view');
    RAISE EXCEPTION 'FAIL doc-anon: anonymous caller shared a document';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
  END;
  RAISE NOTICE 'OK doc-anon: anonymous caller blocked';
END $$;

ROLLBACK;
\echo === PASS 10_document_access_isolation ===
