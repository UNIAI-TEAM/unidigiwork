CREATE TABLE public.tenant_member_profiles (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text,
  department text,
  team text,
  location text,
  phone text,
  emp_id text,
  join_date date,
  reports_to text,
  skills text[] NOT NULL DEFAULT '{}',
  teams text[] NOT NULL DEFAULT '{}',
  about text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_member_profiles TO authenticated;
GRANT ALL ON public.tenant_member_profiles TO service_role;

ALTER TABLE public.tenant_member_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tmp_select_tenant_members"
  ON public.tenant_member_profiles FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE POLICY "tmp_insert_self_or_admin"
  ON public.tenant_member_profiles FOR INSERT TO authenticated
  WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND (
      user_id = auth.uid()
      OR public.has_tenant_role(tenant_id, 'tenant_owner')
      OR public.has_tenant_role(tenant_id, 'tenant_admin')
    )
  );

CREATE POLICY "tmp_update_self_or_admin"
  ON public.tenant_member_profiles FOR UPDATE TO authenticated
  USING (
    public.is_tenant_member(tenant_id)
    AND (
      user_id = auth.uid()
      OR public.has_tenant_role(tenant_id, 'tenant_owner')
      OR public.has_tenant_role(tenant_id, 'tenant_admin')
    )
  )
  WITH CHECK (
    public.is_tenant_member(tenant_id)
    AND (
      user_id = auth.uid()
      OR public.has_tenant_role(tenant_id, 'tenant_owner')
      OR public.has_tenant_role(tenant_id, 'tenant_admin')
    )
  );

CREATE POLICY "tmp_delete_admin"
  ON public.tenant_member_profiles FOR DELETE TO authenticated
  USING (
    public.has_tenant_role(tenant_id, 'tenant_owner')
    OR public.has_tenant_role(tenant_id, 'tenant_admin')
  );

CREATE INDEX idx_tmp_tenant_department ON public.tenant_member_profiles (tenant_id, department);

CREATE TRIGGER trg_tenant_member_profiles_updated_at
  BEFORE UPDATE ON public.tenant_member_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();