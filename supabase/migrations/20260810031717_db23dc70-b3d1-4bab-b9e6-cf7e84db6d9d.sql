CREATE TABLE public.knowledge_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'guide',
  tags text[] NOT NULL DEFAULT '{}',
  cover_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (tenant_id, slug)
);

CREATE INDEX idx_knowledge_articles_tenant_status ON public.knowledge_articles (tenant_id, status, published_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_articles TO authenticated;
GRANT ALL ON public.knowledge_articles TO service_role;

ALTER TABLE public.knowledge_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_articles_select_members"
ON public.knowledge_articles FOR SELECT TO authenticated
USING (public.is_tenant_member(tenant_id));

CREATE POLICY "knowledge_articles_insert_managers"
ON public.knowledge_articles FOR INSERT TO authenticated
WITH CHECK (
  public.has_tenant_role(tenant_id, 'tenant_owner')
  OR public.has_tenant_role(tenant_id, 'tenant_admin')
  OR public.has_tenant_role(tenant_id, 'manager')
);

CREATE POLICY "knowledge_articles_update_managers"
ON public.knowledge_articles FOR UPDATE TO authenticated
USING (
  public.has_tenant_role(tenant_id, 'tenant_owner')
  OR public.has_tenant_role(tenant_id, 'tenant_admin')
  OR public.has_tenant_role(tenant_id, 'manager')
  OR created_by = auth.uid()
)
WITH CHECK (
  public.has_tenant_role(tenant_id, 'tenant_owner')
  OR public.has_tenant_role(tenant_id, 'tenant_admin')
  OR public.has_tenant_role(tenant_id, 'manager')
  OR created_by = auth.uid()
);

CREATE POLICY "knowledge_articles_delete_managers"
ON public.knowledge_articles FOR DELETE TO authenticated
USING (
  public.has_tenant_role(tenant_id, 'tenant_owner')
  OR public.has_tenant_role(tenant_id, 'tenant_admin')
  OR public.has_tenant_role(tenant_id, 'manager')
  OR created_by = auth.uid()
);

CREATE TRIGGER trg_knowledge_articles_updated_at
BEFORE UPDATE ON public.knowledge_articles
FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();