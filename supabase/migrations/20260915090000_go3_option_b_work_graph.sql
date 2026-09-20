-- GO-3 Option B — Work Graph projection for three authorities.
-- Work Product (work_products) ≠ Document (documents) ≠ Work Unit (work_units).
-- Additive / backward compatible. Does not stamp DOCUMENT.semanticType = WORK_PRODUCT.
-- Does not change Office session/save RPCs or document_versions immutability.
-- Does not create work_products_v2. If live already has work_products, that DDL wins.

-- ---------------------------------------------------------------------------
-- 0. Graph channel (idempotent if GO-3A-local migration already applied it)
-- ---------------------------------------------------------------------------
ALTER TABLE public.outbox_deliveries DROP CONSTRAINT IF EXISTS outbox_deliveries_channel_check;
ALTER TABLE public.outbox_deliveries
  ADD CONSTRAINT outbox_deliveries_channel_check
  CHECK (channel IN ('email', 'push', 'webhook', 'noop', 'graph'));

-- ---------------------------------------------------------------------------
-- 1. Entity type: keep DOCUMENT, add WORK_PRODUCT
-- ---------------------------------------------------------------------------
DO $go3_entity_check$
DECLARE def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE n.nspname = 'public' AND t.relname = 'work_nodes'
     AND c.conname = 'work_nodes_entity_type_check';
  IF def IS NOT NULL AND def LIKE '%WORK_PRODUCT%' THEN
    RAISE NOTICE 'work_nodes entity_type already allows WORK_PRODUCT';
  ELSE
    ALTER TABLE public.work_nodes DROP CONSTRAINT IF EXISTS work_nodes_entity_type_check;
    ALTER TABLE public.work_nodes ADD CONSTRAINT work_nodes_entity_type_check
      CHECK (entity_type IN (
        'TENANT','WORKSPACE','TASK','PERSON','MEETING','CHAT_CHANNEL',
        'DOCUMENT','EMAIL','MEETING_ARTIFACT','WORK_PRODUCT'
      ));
  END IF;
END
$go3_entity_check$;

-- ---------------------------------------------------------------------------
-- 2. Edge vocabulary — live WP editor uses REFERENCES / RELATED_TO.
--    REALIZED_AS / PRODUCES are system projections of those source-backed links.
-- ---------------------------------------------------------------------------
INSERT INTO public.work_relationship_types (code, source_type, target_type, user_creatable, system_creatable)
VALUES
  ('BELONGS_TO', 'WORK_PRODUCT', 'WORKSPACE', false, true),
  ('CREATED_BY', 'PERSON', 'WORK_PRODUCT', false, true),
  ('CREATED_BY', 'PERSON', 'DOCUMENT', false, true),
  ('REFERENCES', 'WORK_PRODUCT', 'TASK', true, true),
  ('REFERENCES', 'WORK_PRODUCT', 'DOCUMENT', true, true),
  ('REFERENCES', 'WORK_PRODUCT', 'MEETING', true, true),
  ('REFERENCES', 'WORK_PRODUCT', 'MEETING_ARTIFACT', true, true),
  ('RELATED_TO', 'WORK_PRODUCT', 'TASK', true, true),
  ('RELATED_TO', 'WORK_PRODUCT', 'DOCUMENT', true, true),
  ('RELATED_TO', 'WORK_PRODUCT', 'MEETING', true, true),
  ('RELATED_TO', 'WORK_PRODUCT', 'MEETING_ARTIFACT', true, true),
  ('REFERENCES', 'TASK', 'WORK_PRODUCT', true, true),
  ('RELATED_TO', 'TASK', 'WORK_PRODUCT', true, true),
  ('REFERENCES', 'MEETING', 'WORK_PRODUCT', true, true),
  ('RELATED_TO', 'MEETING', 'WORK_PRODUCT', true, true),
  ('REFERENCES', 'DOCUMENT', 'WORK_PRODUCT', true, true),
  ('RELATED_TO', 'DOCUMENT', 'WORK_PRODUCT', true, true),
  ('REALIZED_AS', 'WORK_PRODUCT', 'DOCUMENT', false, true),
  ('PRODUCES', 'TASK', 'WORK_PRODUCT', false, true),
  ('PRODUCES', 'MEETING', 'WORK_PRODUCT', false, true)
ON CONFLICT (code, source_type, target_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Zip-only compatibility tables. Live already has these — IF NOT EXISTS no-op.
--    Column set is the live UI field list, not a dumped information_schema.
-- ---------------------------------------------------------------------------
DO $go3_tables$
BEGIN
  IF to_regclass('public.work_products') IS NULL THEN
    CREATE TABLE public.work_products (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
      workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
      title text NOT NULL,
      description text,
      business_type text NOT NULL DEFAULT 'DOCUMENT',
      status text NOT NULL DEFAULT 'DRAFT',
      current_version integer NOT NULL DEFAULT 1,
      ai_generated boolean NOT NULL DEFAULT false,
      tags text[] NOT NULL DEFAULT '{}'::text[],
      created_by uuid,
      updated_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      archived_at timestamptz,
      deleted_at timestamptz,
      row_version integer NOT NULL DEFAULT 1
    );
    CREATE INDEX work_products_tenant_idx ON public.work_products (tenant_id);
    CREATE INDEX work_products_workspace_idx ON public.work_products (workspace_id);
    GRANT SELECT, INSERT, UPDATE ON public.work_products TO authenticated;
    GRANT ALL ON public.work_products TO service_role;
    ALTER TABLE public.work_products ENABLE ROW LEVEL SECURITY;
    CREATE POLICY work_products_select ON public.work_products FOR SELECT TO authenticated
      USING (public.is_tenant_member(tenant_id));
    CREATE POLICY work_products_insert ON public.work_products FOR INSERT TO authenticated
      WITH CHECK (public.is_tenant_member(tenant_id));
    CREATE POLICY work_products_update ON public.work_products FOR UPDATE TO authenticated
      USING (public.is_tenant_member(tenant_id)) WITH CHECK (public.is_tenant_member(tenant_id));
  END IF;

  IF to_regclass('public.work_product_versions') IS NULL THEN
    CREATE TABLE public.work_product_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      work_product_id uuid NOT NULL REFERENCES public.work_products(id) ON DELETE CASCADE,
      tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
      version integer NOT NULL,
      summary text,
      title text,
      ai_generated boolean NOT NULL DEFAULT false,
      provenance jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (work_product_id, version)
    );
    CREATE INDEX work_product_versions_wp_idx ON public.work_product_versions (work_product_id, version DESC);
    GRANT SELECT, INSERT ON public.work_product_versions TO authenticated;
    GRANT ALL ON public.work_product_versions TO service_role;
    ALTER TABLE public.work_product_versions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY work_product_versions_select ON public.work_product_versions FOR SELECT TO authenticated
      USING (public.is_tenant_member(tenant_id));
    CREATE POLICY work_product_versions_insert ON public.work_product_versions FOR INSERT TO authenticated
      WITH CHECK (public.is_tenant_member(tenant_id));
  END IF;
END
$go3_tables$;

-- ---------------------------------------------------------------------------
-- 4. JSON helpers — tolerate live column name drift
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._go3_json_str(_j jsonb, VARIADIC _keys text[])
RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE k text; v text;
BEGIN
  IF _j IS NULL THEN RETURN NULL; END IF;
  FOREACH k IN ARRAY _keys LOOP
    v := NULLIF(btrim(_j->>k), '');
    IF v IS NOT NULL AND v <> 'null' THEN RETURN v; END IF;
  END LOOP;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public._go3_json_uuid(_j jsonb, VARIADIC _keys text[])
RETURNS uuid
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE s text;
BEGIN
  s := public._go3_json_str(_j, VARIADIC _keys);
  IF s IS NULL THEN RETURN NULL; END IF;
  BEGIN
    RETURN s::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END $$;

CREATE OR REPLACE FUNCTION public._go3_json_bigint(_j jsonb, VARIADIC _keys text[])
RETURNS bigint
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE s text;
BEGIN
  s := public._go3_json_str(_j, VARIADIC _keys);
  IF s IS NULL THEN RETURN NULL; END IF;
  BEGIN
    RETURN s::bigint;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END $$;

CREATE OR REPLACE FUNCTION public._go3_load_work_product(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE j jsonb;
BEGIN
  IF _id IS NULL OR to_regclass('public.work_products') IS NULL THEN
    RETURN NULL;
  END IF;
  EXECUTE 'SELECT to_jsonb(t) FROM public.work_products t WHERE id = $1' INTO j USING _id;
  RETURN j;
END $$;
REVOKE ALL ON FUNCTION public._go3_load_work_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._go3_load_work_product(uuid) TO postgres, service_role, authenticated;

CREATE OR REPLACE FUNCTION public._go3_work_product_hidden(_j jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT _j IS NULL
      OR NULLIF(_j->>'deleted_at','') IS NOT NULL
      OR NULLIF(_j->>'archived_at','') IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public._go3_work_product_scope(_entity_id uuid)
RETURNS TABLE (tenant_id uuid, workspace_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE j jsonb;
BEGIN
  j := public._go3_load_work_product(_entity_id);
  IF j IS NULL THEN RETURN; END IF;
  tenant_id := public._go3_json_uuid(j, 'tenant_id', 'tenantId');
  workspace_id := public._go3_json_uuid(j, 'workspace_id', 'workspaceId');
  IF tenant_id IS NULL THEN RETURN; END IF;
  RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public._go3_can_view_work_product(_entity_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE j jsonb;
BEGIN
  IF to_regclass('public.work_products') IS NULL THEN RETURN false; END IF;
  EXECUTE 'SELECT to_jsonb(t) FROM public.work_products t WHERE id = $1' INTO j USING _entity_id;
  IF public._go3_work_product_hidden(j) THEN RETURN false; END IF;
  RETURN true;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Visibility + scope (copy live cases, add WORK_PRODUCT)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_work_entity(_entity_type text, _entity_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE ok boolean := false;
BEGIN
  CASE _entity_type
    WHEN 'WORKSPACE' THEN SELECT EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id = _entity_id) INTO ok;
    WHEN 'TASK' THEN SELECT EXISTS(SELECT 1 FROM public.tasks t WHERE t.id = _entity_id AND t.deleted_at IS NULL) INTO ok;
    WHEN 'MEETING' THEN SELECT EXISTS(SELECT 1 FROM public.meetings m WHERE m.id = _entity_id) INTO ok;
    WHEN 'MEETING_ARTIFACT' THEN SELECT EXISTS(SELECT 1 FROM public.meeting_artifacts a WHERE a.id = _entity_id) INTO ok;
    WHEN 'DOCUMENT' THEN SELECT EXISTS(SELECT 1 FROM public.documents d WHERE d.id = _entity_id AND d.deleted_at IS NULL) INTO ok;
    WHEN 'EMAIL' THEN SELECT EXISTS(SELECT 1 FROM public.email_threads e WHERE e.id = _entity_id AND e.deleted_at IS NULL) INTO ok;
    WHEN 'CHAT_CHANNEL' THEN SELECT EXISTS(SELECT 1 FROM public.chat_channels c WHERE c.id = _entity_id AND c.deleted_at IS NULL) INTO ok;
    WHEN 'PERSON' THEN SELECT EXISTS(
        SELECT 1 FROM public.tenant_members tm
        WHERE tm.user_id = _entity_id AND public.is_tenant_member(tm.tenant_id)) INTO ok;
    WHEN 'TENANT' THEN SELECT public.is_tenant_member(_entity_id) INTO ok;
    WHEN 'WORK_PRODUCT' THEN ok := public._go3_can_view_work_product(_entity_id);
    ELSE ok := false;
  END CASE;
  RETURN COALESCE(ok, false);
END $$;

CREATE OR REPLACE FUNCTION public._work_entity_scope(_entity_type text, _entity_id uuid)
RETURNS TABLE (tenant_id uuid, workspace_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  CASE _entity_type
    WHEN 'WORKSPACE' THEN RETURN QUERY SELECT w.tenant_id, w.id FROM public.workspaces w WHERE w.id = _entity_id;
    WHEN 'TASK' THEN RETURN QUERY SELECT t.tenant_id, t.workspace_id FROM public.tasks t WHERE t.id = _entity_id;
    WHEN 'MEETING' THEN RETURN QUERY SELECT m.tenant_id, m.workspace_id FROM public.meetings m WHERE m.id = _entity_id;
    WHEN 'MEETING_ARTIFACT' THEN RETURN QUERY SELECT a.tenant_id, a.workspace_id FROM public.meeting_artifacts a WHERE a.id = _entity_id;
    WHEN 'DOCUMENT' THEN RETURN QUERY SELECT d.tenant_id, d.workspace_id FROM public.documents d WHERE d.id = _entity_id;
    WHEN 'EMAIL' THEN RETURN QUERY SELECT e.tenant_id, e.workspace_id FROM public.email_threads e WHERE e.id = _entity_id;
    WHEN 'CHAT_CHANNEL' THEN RETURN QUERY SELECT c.tenant_id, c.workspace_id FROM public.chat_channels c WHERE c.id = _entity_id;
    WHEN 'TENANT' THEN RETURN QUERY SELECT _entity_id, NULL::uuid;
    WHEN 'WORK_PRODUCT' THEN RETURN QUERY SELECT s.tenant_id, s.workspace_id FROM public._go3_work_product_scope(_entity_id) s;
    ELSE RETURN;
  END CASE;
END $$;
REVOKE EXECUTE ON FUNCTION public._work_entity_scope(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._work_entity_scope(text, uuid) TO authenticated, service_role;

-- Tenant-scoped system link (PERSON must use the entity tenant, not LIMIT 1).
CREATE OR REPLACE FUNCTION public._work_graph_link_system_in_tenant(
  _tenant_id uuid,
  _source_type text, _source_id uuid,
  _target_type text, _target_id uuid,
  _relationship text, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sn uuid; tn uuid; eid uuid; st uuid; tt uuid;
BEGIN
  IF _tenant_id IS NULL OR _source_id IS NULL OR _target_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF _source_type = 'PERSON' THEN
    SELECT tm.tenant_id INTO st FROM public.tenant_members tm
     WHERE tm.user_id = _source_id AND tm.tenant_id = _tenant_id LIMIT 1;
  ELSE
    SELECT s.tenant_id INTO st FROM public._work_entity_scope(_source_type, _source_id) s;
  END IF;

  IF _target_type = 'PERSON' THEN
    SELECT tm.tenant_id INTO tt FROM public.tenant_members tm
     WHERE tm.user_id = _target_id AND tm.tenant_id = _tenant_id LIMIT 1;
  ELSE
    SELECT s.tenant_id INTO tt FROM public._work_entity_scope(_target_type, _target_id) s;
  END IF;

  IF st IS NULL OR tt IS NULL OR st <> tt OR st <> _tenant_id THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.work_nodes (tenant_id, entity_type, entity_id)
  VALUES (st, _source_type, _source_id)
  ON CONFLICT (tenant_id, entity_type, entity_id) DO NOTHING;
  INSERT INTO public.work_nodes (tenant_id, entity_type, entity_id)
  VALUES (tt, _target_type, _target_id)
  ON CONFLICT (tenant_id, entity_type, entity_id) DO NOTHING;

  SELECT id INTO sn FROM public.work_nodes
   WHERE tenant_id = st AND entity_type = _source_type AND entity_id = _source_id;
  SELECT id INTO tn FROM public.work_nodes
   WHERE tenant_id = tt AND entity_type = _target_type AND entity_id = _target_id;
  IF sn IS NULL OR tn IS NULL OR sn = tn THEN RETURN NULL; END IF;

  INSERT INTO public.work_edges (tenant_id, source_node_id, target_node_id, relationship_type, origin, metadata)
  VALUES (st, sn, tn, _relationship, 'SYSTEM', COALESCE(_metadata, '{}'::jsonb))
  ON CONFLICT (tenant_id, source_node_id, target_node_id, relationship_type) DO NOTHING
  RETURNING id INTO eid;
  IF eid IS NULL THEN
    SELECT id INTO eid FROM public.work_edges
     WHERE tenant_id = st AND source_node_id = sn AND target_node_id = tn AND relationship_type = _relationship;
  END IF;
  RETURN eid;
END $$;
REVOKE ALL ON FUNCTION public._work_graph_link_system_in_tenant(uuid, text, uuid, text, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._work_graph_link_system_in_tenant(uuid, text, uuid, text, uuid, text, jsonb) TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- 6. DOCUMENT node — file artifact only (no WORK_PRODUCT semantic stamp)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._touch_document_graph_node(_document_id uuid, _version bigint DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.documents%ROWTYPE;
  nid uuid;
  existing bigint;
  nextv bigint;
  meta jsonb;
BEGIN
  SELECT * INTO d FROM public.documents WHERE id = _document_id;
  IF d.id IS NULL OR d.deleted_at IS NOT NULL THEN
    DELETE FROM public.work_nodes WHERE entity_type = 'DOCUMENT' AND entity_id = _document_id;
    RETURN NULL;
  END IF;

  INSERT INTO public.work_nodes (tenant_id, entity_type, entity_id, metadata)
  VALUES (d.tenant_id, 'DOCUMENT', d.id, jsonb_build_object(
    'latestVersion', COALESCE(_version, d.current_version, 1),
    'title', d.title,
    'mimeType', d.mime_type
  ))
  ON CONFLICT (tenant_id, entity_type, entity_id) DO NOTHING;

  SELECT id, metadata INTO nid, meta
  FROM public.work_nodes
  WHERE tenant_id = d.tenant_id AND entity_type = 'DOCUMENT' AND entity_id = d.id;
  IF nid IS NULL THEN RETURN NULL; END IF;

  existing := COALESCE((meta->>'latestVersion')::bigint, 0);
  nextv := GREATEST(existing, COALESCE(_version, d.current_version, 0));
  UPDATE public.work_nodes
     SET metadata = (COALESCE(meta, '{}'::jsonb) - 'semanticType' - 'workProductType')
                    || jsonb_build_object(
                         'latestVersion', nextv,
                         'title', d.title,
                         'mimeType', d.mime_type
                       ),
         updated_at = now()
   WHERE id = nid;

  PERFORM public._work_graph_reconcile_single('DOCUMENT', d.id, 'WORKSPACE', d.workspace_id, 'BELONGS_TO');
  IF d.created_by IS NOT NULL THEN
    PERFORM public._work_graph_link_system_in_tenant(
      d.tenant_id, 'PERSON', d.created_by, 'DOCUMENT', d.id, 'CREATED_BY');
  END IF;
  RETURN nid;
END $$;
REVOKE ALL ON FUNCTION public._touch_document_graph_node(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._touch_document_graph_node(uuid, bigint) TO postgres, service_role;

-- Back-compat alias: old name must not stamp DOCUMENT as WORK_PRODUCT.
CREATE OR REPLACE FUNCTION public._touch_document_work_product_node(_document_id uuid, _version bigint DEFAULT NULL)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public._touch_document_graph_node(_document_id, _version);
$$;
REVOKE ALL ON FUNCTION public._touch_document_work_product_node(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._touch_document_work_product_node(uuid, bigint) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.tg_work_graph_project_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
      DELETE FROM public.work_nodes WHERE entity_type = 'DOCUMENT' AND entity_id = NEW.id;
      RETURN NULL;
    END IF;
    PERFORM public._touch_document_graph_node(NEW.id, NEW.current_version);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- DOCUMENT_WRITE_INDEPENDENT_OF_GRAPH
  END;
  RETURN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 7. WORK_PRODUCT node — business deliverable
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._touch_work_product_graph_node(_work_product_id uuid, _version bigint DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j jsonb;
  tid uuid;
  ws uuid;
  nid uuid;
  existing bigint;
  nextv bigint;
  meta jsonb;
  creator uuid;
BEGIN
  j := public._go3_load_work_product(_work_product_id);
  IF public._go3_work_product_hidden(j) THEN
    DELETE FROM public.work_nodes WHERE entity_type = 'WORK_PRODUCT' AND entity_id = _work_product_id;
    RETURN NULL;
  END IF;
  tid := public._go3_json_uuid(j, 'tenant_id', 'tenantId');
  IF tid IS NULL THEN RETURN NULL; END IF;
  ws := public._go3_json_uuid(j, 'workspace_id', 'workspaceId');
  creator := public._go3_json_uuid(j, 'created_by', 'owner_id', 'createdBy');

  INSERT INTO public.work_nodes (tenant_id, entity_type, entity_id, metadata)
  VALUES (tid, 'WORK_PRODUCT', _work_product_id, jsonb_build_object(
    'title', COALESCE(public._go3_json_str(j, 'title', 'name'), ''),
    'businessType', public._go3_json_str(j, 'business_type', 'businessType'),
    'status', public._go3_json_str(j, 'status'),
    'latestBusinessVersion', COALESCE(_version, public._go3_json_bigint(j, 'current_version', 'currentVersion'), 1),
    'createdAt', public._go3_json_str(j, 'created_at', 'createdAt'),
    'updatedAt', public._go3_json_str(j, 'updated_at', 'updatedAt')
  ))
  ON CONFLICT (tenant_id, entity_type, entity_id) DO NOTHING;

  SELECT id, metadata INTO nid, meta
  FROM public.work_nodes
  WHERE tenant_id = tid AND entity_type = 'WORK_PRODUCT' AND entity_id = _work_product_id;
  IF nid IS NULL THEN RETURN NULL; END IF;

  existing := COALESCE((meta->>'latestBusinessVersion')::bigint, 0);
  nextv := GREATEST(existing, COALESCE(_version, public._go3_json_bigint(j, 'current_version', 'currentVersion'), 0));
  UPDATE public.work_nodes
     SET metadata = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
           'title', COALESCE(public._go3_json_str(j, 'title', 'name'), ''),
           'businessType', public._go3_json_str(j, 'business_type', 'businessType'),
           'status', public._go3_json_str(j, 'status'),
           'latestBusinessVersion', nextv,
           'createdAt', public._go3_json_str(j, 'created_at', 'createdAt'),
           'updatedAt', public._go3_json_str(j, 'updated_at', 'updatedAt')
         ),
         updated_at = now()
   WHERE id = nid;

  IF ws IS NOT NULL THEN
    PERFORM public._work_graph_reconcile_single('WORK_PRODUCT', _work_product_id, 'WORKSPACE', ws, 'BELONGS_TO');
  END IF;
  IF creator IS NOT NULL THEN
    PERFORM public._work_graph_link_system_in_tenant(
      tid, 'PERSON', creator, 'WORK_PRODUCT', _work_product_id, 'CREATED_BY');
  END IF;
  RETURN nid;
END $$;
REVOKE ALL ON FUNCTION public._touch_work_product_graph_node(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._touch_work_product_graph_node(uuid, bigint) TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- 8. System overlays from source-backed user links
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._go3_project_user_wp_link(
  _source_type text, _source_id uuid, _target_type text, _target_id uuid, _relationship text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE st uuid; tt uuid;
BEGIN
  IF _relationship NOT IN ('REFERENCES', 'RELATED_TO') THEN RETURN; END IF;
  SELECT s.tenant_id INTO st FROM public._work_entity_scope(_source_type, _source_id) s;
  SELECT s.tenant_id INTO tt FROM public._work_entity_scope(_target_type, _target_id) s;
  IF st IS NULL OR tt IS NULL OR st <> tt THEN RETURN; END IF;

  IF (_source_type = 'WORK_PRODUCT' AND _target_type = 'DOCUMENT')
     OR (_source_type = 'DOCUMENT' AND _target_type = 'WORK_PRODUCT') THEN
    PERFORM public._touch_work_product_graph_node(
      CASE WHEN _source_type = 'WORK_PRODUCT' THEN _source_id ELSE _target_id END, NULL);
    PERFORM public._touch_document_graph_node(
      CASE WHEN _source_type = 'DOCUMENT' THEN _source_id ELSE _target_id END, NULL);
    PERFORM public._work_graph_link_system_in_tenant(
      st, 'WORK_PRODUCT',
      CASE WHEN _source_type = 'WORK_PRODUCT' THEN _source_id ELSE _target_id END,
      'DOCUMENT',
      CASE WHEN _source_type = 'DOCUMENT' THEN _source_id ELSE _target_id END,
      'REALIZED_AS');
  ELSIF (_source_type = 'WORK_PRODUCT' AND _target_type = 'TASK')
     OR (_source_type = 'TASK' AND _target_type = 'WORK_PRODUCT') THEN
    PERFORM public._touch_work_product_graph_node(
      CASE WHEN _source_type = 'WORK_PRODUCT' THEN _source_id ELSE _target_id END, NULL);
    PERFORM public._work_graph_link_system_in_tenant(
      st, 'TASK',
      CASE WHEN _source_type = 'TASK' THEN _source_id ELSE _target_id END,
      'WORK_PRODUCT',
      CASE WHEN _source_type = 'WORK_PRODUCT' THEN _source_id ELSE _target_id END,
      'PRODUCES');
  ELSIF (_source_type = 'WORK_PRODUCT' AND _target_type = 'MEETING')
     OR (_source_type = 'MEETING' AND _target_type = 'WORK_PRODUCT') THEN
    PERFORM public._touch_work_product_graph_node(
      CASE WHEN _source_type = 'WORK_PRODUCT' THEN _source_id ELSE _target_id END, NULL);
    PERFORM public._work_graph_link_system_in_tenant(
      st, 'MEETING',
      CASE WHEN _source_type = 'MEETING' THEN _source_id ELSE _target_id END,
      'WORK_PRODUCT',
      CASE WHEN _source_type = 'WORK_PRODUCT' THEN _source_id ELSE _target_id END,
      'PRODUCES');
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._go3_project_user_wp_link(text, uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._go3_project_user_wp_link(text, uuid, text, uuid, text) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public._go3_unproject_user_wp_link(
  _source_type text, _source_id uuid, _target_type text, _target_id uuid, _relationship text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE still boolean; wp uuid; other uuid; rel text; src_t text; tgt_t text;
BEGIN
  IF _relationship NOT IN ('REFERENCES', 'RELATED_TO') THEN RETURN; END IF;

  IF (_source_type = 'WORK_PRODUCT' AND _target_type IN ('DOCUMENT','TASK','MEETING'))
     OR (_target_type = 'WORK_PRODUCT' AND _source_type IN ('DOCUMENT','TASK','MEETING')) THEN
    IF _source_type = 'WORK_PRODUCT' THEN
      wp := _source_id; other := _target_id; src_t := _target_type;
    ELSE
      wp := _target_id; other := _source_id; src_t := _source_type;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.work_edges e
      JOIN public.work_nodes ns ON ns.id = e.source_node_id
      JOIN public.work_nodes nt ON nt.id = e.target_node_id
      WHERE e.relationship_type IN ('REFERENCES','RELATED_TO') AND e.origin = 'USER'
        AND (
          (ns.entity_type = 'WORK_PRODUCT' AND ns.entity_id = wp AND nt.entity_type = src_t AND nt.entity_id = other)
          OR (nt.entity_type = 'WORK_PRODUCT' AND nt.entity_id = wp AND ns.entity_type = src_t AND ns.entity_id = other)
        )
    ) INTO still;
    IF still THEN RETURN; END IF;

    IF src_t = 'DOCUMENT' THEN
      rel := 'REALIZED_AS'; tgt_t := 'DOCUMENT';
      DELETE FROM public.work_edges e
      USING public.work_nodes ns, public.work_nodes nt
      WHERE e.source_node_id = ns.id AND e.target_node_id = nt.id
        AND e.relationship_type = rel AND e.origin = 'SYSTEM'
        AND ns.entity_type = 'WORK_PRODUCT' AND ns.entity_id = wp
        AND nt.entity_type = tgt_t AND nt.entity_id = other;
    ELSIF src_t IN ('TASK','MEETING') THEN
      DELETE FROM public.work_edges e
      USING public.work_nodes ns, public.work_nodes nt
      WHERE e.source_node_id = ns.id AND e.target_node_id = nt.id
        AND e.relationship_type = 'PRODUCES' AND e.origin = 'SYSTEM'
        AND ns.entity_type = src_t AND ns.entity_id = other
        AND nt.entity_type = 'WORK_PRODUCT' AND nt.entity_id = wp;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tg_go3_work_edges_semantic()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.work_nodes%ROWTYPE; t public.work_nodes%ROWTYPE;
BEGIN
  BEGIN
    SELECT * INTO s FROM public.work_nodes WHERE id = NEW.source_node_id;
    SELECT * INTO t FROM public.work_nodes WHERE id = NEW.target_node_id;
    IF s.id IS NULL OR t.id IS NULL THEN RETURN NULL; END IF;
    -- Do NOT convert Task/Meeting → Document into Work Product.
    PERFORM public._go3_project_user_wp_link(s.entity_type, s.entity_id, t.entity_type, t.entity_id, NEW.relationship_type);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS work_edges_project_produces ON public.work_edges;
DROP TRIGGER IF EXISTS work_edges_go3_semantic ON public.work_edges;
CREATE TRIGGER work_edges_go3_semantic
  AFTER INSERT ON public.work_edges
  FOR EACH ROW EXECUTE FUNCTION public.tg_go3_work_edges_semantic();

CREATE OR REPLACE FUNCTION public.tg_go3_work_edges_unproject()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.work_nodes%ROWTYPE; t public.work_nodes%ROWTYPE;
BEGIN
  BEGIN
    SELECT * INTO s FROM public.work_nodes WHERE id = OLD.source_node_id;
    SELECT * INTO t FROM public.work_nodes WHERE id = OLD.target_node_id;
    IF s.id IS NULL OR t.id IS NULL THEN RETURN NULL; END IF;
    PERFORM public._go3_unproject_user_wp_link(s.entity_type, s.entity_id, t.entity_type, t.entity_id, OLD.relationship_type);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS work_edges_unproject_produces ON public.work_edges;
DROP TRIGGER IF EXISTS work_edges_go3_unproject ON public.work_edges;
CREATE TRIGGER work_edges_go3_unproject
  AFTER DELETE ON public.work_edges
  FOR EACH ROW EXECUTE FUNCTION public.tg_go3_work_edges_unproject();

-- ---------------------------------------------------------------------------
-- 9. Event projectors (async; source write already committed)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.project_document_version_uploaded(_tenant_id uuid, _payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  doc_id uuid;
  ver bigint;
  d public.documents%ROWTYPE;
  nid uuid;
  latest bigint;
BEGIN
  doc_id := COALESCE(
    NULLIF(_payload->>'document_id', '')::uuid,
    NULLIF(_payload->>'documentId', '')::uuid
  );
  ver := COALESCE(NULLIF(_payload->>'version', '')::bigint, 0);
  IF doc_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_PAYLOAD');
  END IF;
  SELECT * INTO d FROM public.documents WHERE id = doc_id;
  IF d.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;
  IF _tenant_id IS NOT NULL AND d.tenant_id <> _tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CROSS_TENANT');
  END IF;
  nid := public._touch_document_graph_node(doc_id, ver);
  IF nid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DELETED_OR_MISSING');
  END IF;
  SELECT COALESCE((metadata->>'latestVersion')::bigint, 0) INTO latest
  FROM public.work_nodes WHERE id = nid;
  RETURN jsonb_build_object(
    'ok', true,
    'documentId', doc_id,
    'nodeId', nid,
    'latestVersion', latest
  );
END $$;
REVOKE ALL ON FUNCTION public.project_document_version_uploaded(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_document_version_uploaded(uuid, jsonb) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.project_work_product_upserted(_tenant_id uuid, _payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  wp_id uuid;
  ver bigint;
  j jsonb;
  tid uuid;
  nid uuid;
  latest bigint;
BEGIN
  IF to_regclass('public.work_products') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SOURCE_TABLE_MISSING');
  END IF;
  wp_id := COALESCE(
    NULLIF(_payload->>'work_product_id','')::uuid,
    NULLIF(_payload->>'workProductId','')::uuid,
    NULLIF(_payload->>'id','')::uuid
  );
  ver := COALESCE(NULLIF(_payload->>'version','')::bigint, NULLIF(_payload->>'current_version','')::bigint);
  IF wp_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_PAYLOAD');
  END IF;
  j := public._go3_load_work_product(wp_id);
  IF j IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;
  tid := public._go3_json_uuid(j, 'tenant_id', 'tenantId');
  IF _tenant_id IS NOT NULL AND tid IS DISTINCT FROM _tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CROSS_TENANT');
  END IF;
  nid := public._touch_work_product_graph_node(wp_id, ver);
  IF nid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DELETED_OR_MISSING');
  END IF;
  SELECT COALESCE((metadata->>'latestBusinessVersion')::bigint, 0) INTO latest
  FROM public.work_nodes WHERE id = nid;
  RETURN jsonb_build_object(
    'ok', true,
    'workProductId', wp_id,
    'nodeId', nid,
    'latestBusinessVersion', latest
  );
END $$;
REVOKE ALL ON FUNCTION public.project_work_product_upserted(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_work_product_upserted(uuid, jsonb) TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- 10. Best-effort outbox at WP write boundary (never fails the source row)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._go3_emit_work_product_outbox(_id uuid, _event text, _payload jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j jsonb; tid uuid;
BEGIN
  j := public._go3_load_work_product(_id);
  tid := COALESCE(
    public._go3_json_uuid(_payload, 'tenant_id', 'tenantId'),
    public._go3_json_uuid(j, 'tenant_id', 'tenantId')
  );
  IF tid IS NULL THEN RETURN; END IF;
  BEGIN
    PERFORM public._emit_outbox_event(
      tid,
      _event,
      'work_product',
      _id::text,
      COALESCE(_payload, jsonb_build_object('work_product_id', _id)),
      _event || ':' || _id::text || ':' || COALESCE(_payload->>'version', _payload->>'current_version', _payload->>'updated_at', j->>'current_version', j->>'updated_at', '0'),
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

CREATE OR REPLACE FUNCTION public.tg_go3_work_product_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public._touch_work_product_graph_node(NEW.id, NULL);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  BEGIN
    PERFORM public._go3_emit_work_product_outbox(
      NEW.id,
      'work_product.work_product.upserted',
      to_jsonb(NEW) || jsonb_build_object('work_product_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END $$;

DO $go3_wp_tg$
BEGIN
  IF to_regclass('public.work_products') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS go3_work_product_graph ON public.work_products;
    EXECUTE $q$
      CREATE TRIGGER go3_work_product_graph
        AFTER INSERT OR UPDATE ON public.work_products
        FOR EACH ROW EXECUTE FUNCTION public.tg_go3_work_product_write()
    $q$;
  END IF;
END
$go3_wp_tg$;

CREATE OR REPLACE FUNCTION public.tg_go3_work_product_version_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wp uuid; ver bigint; payload jsonb;
BEGIN
  payload := to_jsonb(NEW);
  wp := COALESCE(
    public._go3_json_uuid(payload, 'work_product_id', 'workProductId', 'product_id'),
    NEW.id
  );
  ver := public._go3_json_bigint(payload, 'version');
  BEGIN
    PERFORM public._touch_work_product_graph_node(wp, ver);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  BEGIN
    PERFORM public._go3_emit_work_product_outbox(
      wp,
      'work_product.work_product.version_created',
      payload || jsonb_build_object('work_product_id', wp, 'version', ver)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END $$;

DO $go3_wpv_tg$
BEGIN
  IF to_regclass('public.work_product_versions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS go3_work_product_version_graph ON public.work_product_versions;
    EXECUTE $q$
      CREATE TRIGGER go3_work_product_version_graph
        AFTER INSERT ON public.work_product_versions
        FOR EACH ROW EXECUTE FUNCTION public.tg_go3_work_product_version_write()
    $q$;
  END IF;
END
$go3_wpv_tg$;

-- ---------------------------------------------------------------------------
-- 11. Backfill — reuse nodes, repair metadata, project source-backed links
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.go3_work_graph_backfill(_tenant_id uuid, _limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  n_doc int := 0;
  n_wp int := 0;
  e record;
BEGIN
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;
  _limit := GREATEST(1, LEAST(COALESCE(_limit, 200), 2000));

  FOR r IN
    SELECT id FROM public.documents
     WHERE tenant_id = _tenant_id AND deleted_at IS NULL
     ORDER BY created_at
     LIMIT _limit
  LOOP
    PERFORM public._touch_document_graph_node(r.id, NULL);
    n_doc := n_doc + 1;
  END LOOP;

  IF to_regclass('public.work_products') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='work_products' AND column_name='tenant_id'
     ) THEN
    FOR r IN EXECUTE format(
      'SELECT id FROM public.work_products WHERE tenant_id = $1 %s ORDER BY created_at LIMIT $2',
      CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='work_products' AND column_name='deleted_at'
      ) THEN 'AND deleted_at IS NULL' ELSE '' END
    ) USING _tenant_id, _limit
    LOOP
      PERFORM public._touch_work_product_graph_node(r.id, NULL);
      n_wp := n_wp + 1;
    END LOOP;
  END IF;

  FOR e IN
    SELECT s.entity_id AS source_id, s.entity_type AS source_type,
           t.entity_id AS target_id, t.entity_type AS target_type, we.relationship_type
      FROM public.work_edges we
      JOIN public.work_nodes s ON s.id = we.source_node_id
      JOIN public.work_nodes t ON t.id = we.target_node_id
     WHERE we.tenant_id = _tenant_id
       AND we.relationship_type IN ('REFERENCES','RELATED_TO')
       AND (
         s.entity_type = 'WORK_PRODUCT' OR t.entity_type = 'WORK_PRODUCT'
       )
  LOOP
    PERFORM public._go3_project_user_wp_link(e.source_type, e.source_id, e.target_type, e.target_id, e.relationship_type);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'tenantId', _tenant_id,
    'documentsProjected', n_doc,
    'workProductsProjected', n_wp
  );
END $$;
REVOKE ALL ON FUNCTION public.go3_work_graph_backfill(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.go3_work_graph_backfill(uuid, integer) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.work_product_graph_backfill(_tenant_id uuid, _limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.go3_work_graph_backfill(_tenant_id, _limit);
$$;
REVOKE ALL ON FUNCTION public.work_product_graph_backfill(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.work_product_graph_backfill(uuid, integer) TO postgres, service_role;
