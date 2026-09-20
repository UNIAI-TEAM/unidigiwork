CREATE TABLE public.project_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

CREATE INDEX idx_project_comments_project ON public.project_comments (project_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_comments TO authenticated;
GRANT ALL ON public.project_comments TO service_role;

ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_comments_tenant_select ON public.project_comments
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id) AND deleted_at IS NULL);

CREATE POLICY project_comments_member_insert ON public.project_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND p.tenant_id = project_comments.tenant_id
        AND public.is_workspace_member(p.workspace_id, auth.uid())
    )
  );

CREATE POLICY project_comments_author_update ON public.project_comments
  FOR UPDATE TO authenticated
  USING (public.is_tenant_member(tenant_id) AND author_id = auth.uid())
  WITH CHECK (public.is_tenant_member(tenant_id) AND author_id = auth.uid());

CREATE POLICY project_comments_author_delete ON public.project_comments
  FOR DELETE TO authenticated
  USING (public.is_tenant_member(tenant_id) AND author_id = auth.uid());