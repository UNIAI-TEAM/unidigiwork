CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  description text,
  status text NOT NULL DEFAULT 'planning',
  color text,
  tags text[] NOT NULL DEFAULT '{}',
  start_date date,
  due_date date,
  owner_id uuid,
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_status_check CHECK (status IN ('planning','active','on_hold','completed','canceled'))
);

CREATE INDEX projects_tenant_idx ON public.projects(tenant_id);
CREATE INDEX projects_workspace_idx ON public.projects(workspace_id);
CREATE UNIQUE INDEX projects_workspace_code_uidx ON public.projects(workspace_id, lower(code)) WHERE code IS NOT NULL AND deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_tenant_select ON public.projects
  FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id) AND deleted_at IS NULL);

CREATE POLICY projects_member_insert ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (is_tenant_member(tenant_id) AND is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY projects_member_update ON public.projects
  FOR UPDATE TO authenticated
  USING (is_tenant_member(tenant_id) AND is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (is_tenant_member(tenant_id) AND is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY projects_member_delete ON public.projects
  FOR DELETE TO authenticated
  USING (is_tenant_member(tenant_id) AND is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_project_id_fkey FOREIGN KEY (project_id)
  REFERENCES public.projects(id) ON DELETE SET NULL;