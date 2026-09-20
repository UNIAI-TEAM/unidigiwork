-- 1. work_products
CREATE TABLE public.work_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  business_type text NOT NULL DEFAULT 'DOCUMENT'
    CHECK (business_type IN ('PROPOSAL','REPORT','ANALYSIS','CONTRACT','PLAN','PRESENTATION','MEMO','DOCUMENT','OTHER')),
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','IN_REVIEW','CHANGES_REQUESTED','APPROVED','FINAL','ARCHIVED')),
  content text NOT NULL DEFAULT '',
  owner_id uuid,
  created_by uuid,
  created_by_agent_id uuid,
  ai_generated boolean NOT NULL DEFAULT false,
  current_version integer NOT NULL DEFAULT 0,
  primary_context_type text CHECK (primary_context_type IN ('WORKSPACE','MEETING','TASK','DOCUMENT','EMAIL')),
  primary_context_id uuid,
  tags text[] NOT NULL DEFAULT '{}',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_products_primary_context_pair CHECK (
    (primary_context_type IS NULL AND primary_context_id IS NULL)
    OR (primary_context_type IS NOT NULL AND primary_context_id IS NOT NULL)
  )
);
CREATE INDEX work_products_tenant_idx ON public.work_products (tenant_id, updated_at DESC);
CREATE INDEX work_products_workspace_idx ON public.work_products (workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX work_products_status_idx ON public.work_products (tenant_id, status);
CREATE INDEX work_products_owner_idx ON public.work_products (owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_products TO authenticated;
GRANT ALL ON public.work_products TO service_role;
ALTER TABLE public.work_products ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_work_product(_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.work_products wp
    WHERE wp.id = _id
      AND wp.deleted_at IS NULL
      AND public.is_tenant_member(wp.tenant_id)
      AND (
        wp.workspace_id IS NULL
        OR public.is_workspace_member(wp.workspace_id, auth.uid())
        OR wp.owner_id = auth.uid()
        OR wp.created_by = auth.uid()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_work_product(_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.work_products wp
    WHERE wp.id = _id
      AND wp.deleted_at IS NULL
      AND public.is_tenant_member(wp.tenant_id)
      AND (wp.owner_id = auth.uid() OR wp.created_by = auth.uid())
  );
$$;

CREATE POLICY "work_products_select" ON public.work_products FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND public.is_tenant_member(tenant_id)
    AND (
      workspace_id IS NULL
      OR public.is_workspace_member(workspace_id, auth.uid())
      OR owner_id = auth.uid()
      OR created_by = auth.uid()
    )
  );
CREATE POLICY "work_products_insert" ON public.work_products FOR INSERT TO authenticated
  WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND created_by = auth.uid()
    AND (workspace_id IS NULL OR public.is_workspace_member(workspace_id, auth.uid()))
  );
CREATE POLICY "work_products_update" ON public.work_products FOR UPDATE TO authenticated
  USING (public.is_tenant_member(tenant_id) AND (owner_id = auth.uid() OR created_by = auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id));
CREATE POLICY "work_products_delete" ON public.work_products FOR DELETE TO authenticated
  USING (public.is_tenant_member(tenant_id) AND (owner_id = auth.uid() OR created_by = auth.uid()));

CREATE TRIGGER work_products_updated_at BEFORE UPDATE ON public.work_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. artifacts (multi-representation)
CREATE TABLE public.work_product_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  work_product_id uuid NOT NULL REFERENCES public.work_products(id) ON DELETE CASCADE,
  format text NOT NULL CHECK (format IN ('NATIVE','MARKDOWN','HTML','DOCX','XLSX','PPTX','PDF','CSV','OTHER')),
  role text NOT NULL DEFAULT 'EXPORT' CHECK (role IN ('SOURCE','EXPORT','PREVIEW')),
  storage_ref text,
  mime_type text,
  size_bytes bigint,
  version integer NOT NULL DEFAULT 1,
  generated_by text NOT NULL DEFAULT 'USER' CHECK (generated_by IN ('USER','AI','SYSTEM')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_product_artifacts_wp_idx ON public.work_product_artifacts (work_product_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_product_artifacts TO authenticated;
GRANT ALL ON public.work_product_artifacts TO service_role;
ALTER TABLE public.work_product_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_product_artifacts_select" ON public.work_product_artifacts FOR SELECT TO authenticated
  USING (public.can_view_work_product(work_product_id));
CREATE POLICY "work_product_artifacts_write" ON public.work_product_artifacts FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_work_product(work_product_id));
CREATE POLICY "work_product_artifacts_update" ON public.work_product_artifacts FOR UPDATE TO authenticated
  USING (public.can_edit_work_product(work_product_id))
  WITH CHECK (public.can_edit_work_product(work_product_id));
CREATE POLICY "work_product_artifacts_delete" ON public.work_product_artifacts FOR DELETE TO authenticated
  USING (public.can_edit_work_product(work_product_id));

CREATE TRIGGER work_product_artifacts_updated_at BEFORE UPDATE ON public.work_product_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. versions (immutable, with provenance snapshot)
CREATE TABLE public.work_product_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  work_product_id uuid NOT NULL REFERENCES public.work_products(id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text,
  content text NOT NULL DEFAULT '',
  summary text,
  artifacts_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_generated boolean NOT NULL DEFAULT false,
  author_id uuid,
  author_agent_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_product_id, version)
);
CREATE INDEX work_product_versions_wp_idx ON public.work_product_versions (work_product_id, version DESC);

GRANT SELECT, INSERT ON public.work_product_versions TO authenticated;
GRANT ALL ON public.work_product_versions TO service_role;
ALTER TABLE public.work_product_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_product_versions_select" ON public.work_product_versions FOR SELECT TO authenticated
  USING (public.can_view_work_product(work_product_id));
CREATE POLICY "work_product_versions_insert" ON public.work_product_versions FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_work_product(work_product_id));

-- 4. comments
CREATE TABLE public.work_product_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  work_product_id uuid NOT NULL REFERENCES public.work_products(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.work_product_comments(id) ON DELETE CASCADE,
  body text NOT NULL,
  anchor jsonb,
  author_id uuid,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_product_comments_wp_idx ON public.work_product_comments (work_product_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_product_comments TO authenticated;
GRANT ALL ON public.work_product_comments TO service_role;
ALTER TABLE public.work_product_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_product_comments_select" ON public.work_product_comments FOR SELECT TO authenticated
  USING (public.can_view_work_product(work_product_id));
CREATE POLICY "work_product_comments_insert" ON public.work_product_comments FOR INSERT TO authenticated
  WITH CHECK (public.can_view_work_product(work_product_id) AND author_id = auth.uid());
CREATE POLICY "work_product_comments_update" ON public.work_product_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.can_edit_work_product(work_product_id))
  WITH CHECK (public.can_view_work_product(work_product_id));
CREATE POLICY "work_product_comments_delete" ON public.work_product_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.can_edit_work_product(work_product_id));

CREATE TRIGGER work_product_comments_updated_at BEFORE UPDATE ON public.work_product_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. reviews
CREATE TABLE public.work_product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  work_product_id uuid NOT NULL REFERENCES public.work_products(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL,
  requested_by uuid,
  version integer,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','CHANGES_REQUESTED','CANCELED')),
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_product_reviews_wp_idx ON public.work_product_reviews (work_product_id, created_at DESC);
CREATE INDEX work_product_reviews_reviewer_idx ON public.work_product_reviews (reviewer_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_product_reviews TO authenticated;
GRANT ALL ON public.work_product_reviews TO service_role;
ALTER TABLE public.work_product_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "work_product_reviews_select" ON public.work_product_reviews FOR SELECT TO authenticated
  USING (public.can_view_work_product(work_product_id) OR reviewer_id = auth.uid());
CREATE POLICY "work_product_reviews_insert" ON public.work_product_reviews FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_work_product(work_product_id) AND requested_by = auth.uid());
CREATE POLICY "work_product_reviews_update" ON public.work_product_reviews FOR UPDATE TO authenticated
  USING (reviewer_id = auth.uid() OR public.can_edit_work_product(work_product_id))
  WITH CHECK (reviewer_id = auth.uid() OR public.can_edit_work_product(work_product_id));
CREATE POLICY "work_product_reviews_delete" ON public.work_product_reviews FOR DELETE TO authenticated
  USING (public.can_edit_work_product(work_product_id));

CREATE TRIGGER work_product_reviews_updated_at BEFORE UPDATE ON public.work_product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Work Graph: WORK_PRODUCT entity type
ALTER TABLE public.work_nodes DROP CONSTRAINT work_nodes_entity_type_check;
ALTER TABLE public.work_nodes ADD CONSTRAINT work_nodes_entity_type_check CHECK (
  entity_type = ANY (ARRAY['TENANT','WORKSPACE','TASK','PERSON','MEETING','CHAT_CHANNEL','DOCUMENT','EMAIL','MEETING_ARTIFACT','WORK_PRODUCT'])
);

CREATE OR REPLACE FUNCTION public._work_entity_scope(_entity_type text, _entity_id uuid)
RETURNS TABLE(tenant_id uuid, workspace_id uuid)
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
    WHEN 'WORK_PRODUCT' THEN RETURN QUERY SELECT p.tenant_id, p.workspace_id FROM public.work_products p WHERE p.id = _entity_id;
    WHEN 'TENANT' THEN RETURN QUERY SELECT _entity_id, NULL::uuid;
    ELSE RETURN;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_work_entity(_entity_type text, _entity_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    WHEN 'WORK_PRODUCT' THEN SELECT public.can_view_work_product(_entity_id) INTO ok;
    WHEN 'PERSON' THEN SELECT EXISTS(
        SELECT 1 FROM public.tenant_members tm
        WHERE tm.user_id = _entity_id AND public.is_tenant_member(tm.tenant_id)) INTO ok;
    WHEN 'TENANT' THEN SELECT public.is_tenant_member(_entity_id) INTO ok;
    ELSE ok := false;
  END CASE;
  RETURN COALESCE(ok, false);
END;
$$;

INSERT INTO public.work_relationship_types (code, source_type, target_type, user_creatable, system_creatable) VALUES
  ('BELONGS_TO','WORK_PRODUCT','WORKSPACE', false, true),
  ('REFERENCES','WORK_PRODUCT','DOCUMENT', true, true),
  ('REFERENCES','WORK_PRODUCT','TASK', true, true),
  ('REFERENCES','WORK_PRODUCT','MEETING', true, true),
  ('REFERENCES','WORK_PRODUCT','MEETING_ARTIFACT', true, true),
  ('REFERENCES','WORK_PRODUCT','EMAIL', true, true),
  ('REFERENCES','WORK_PRODUCT','WORK_PRODUCT', true, true),
  ('GENERATES','MEETING','WORK_PRODUCT', false, true),
  ('GENERATES','WORK_PRODUCT','TASK', true, true),
  ('RELATED_TO','WORK_PRODUCT','WORK_PRODUCT', true, true),
  ('ASSIGNED_TO','WORK_PRODUCT','PERSON', false, true)
ON CONFLICT DO NOTHING;

-- keep workspace membership edge in sync
CREATE OR REPLACE FUNCTION public.tg_work_graph_work_product()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sn uuid; tn uuid;
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.workspace_id IS NULL THEN RETURN NEW; END IF;
  sn := public.ensure_work_node('WORK_PRODUCT', NEW.id);
  tn := public.ensure_work_node('WORKSPACE', NEW.workspace_id);
  IF sn IS NOT NULL AND tn IS NOT NULL AND sn <> tn THEN
    INSERT INTO public.work_edges (tenant_id, workspace_id, source_node_id, target_node_id, relationship_type, origin)
    VALUES (NEW.tenant_id, NEW.workspace_id, sn, tn, 'BELONGS_TO', 'SYSTEM')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER work_graph_work_product
  AFTER INSERT OR UPDATE OF workspace_id, deleted_at ON public.work_products
  FOR EACH ROW EXECUTE FUNCTION public.tg_work_graph_work_product();

CREATE TRIGGER trg_audit_work_products
  AFTER INSERT OR UPDATE OR DELETE ON public.work_products
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('work_product');