
-- =========================================================
-- Batch 0B.2: Tenants + Tenant Membership
-- Additive. Depends on 0B.1 (public.users).
-- =========================================================

-- Enum roles for tenant membership
DO $$ BEGIN
  CREATE TYPE public.tenant_role AS ENUM ('tenant_owner','tenant_admin','manager','member','guest');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.tenant_member_status AS ENUM ('active','invited','suspended','removed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1) tenants
CREATE TABLE IF NOT EXISTS public.tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL,
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'active',
  deleted_at  timestamptz,
  row_version bigint NOT NULL DEFAULT 1,
  created_by  uuid REFERENCES public.users(id),
  updated_by  uuid REFERENCES public.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_slug_unique UNIQUE (slug),
  CONSTRAINT tenants_status_chk CHECK (status IN ('active','suspended','archived'))
);

-- Composite unique for cross-tenant FK enforcement
CREATE UNIQUE INDEX IF NOT EXISTS tenants_tenant_id_id_uniq
  ON public.tenants(id, id);

GRANT SELECT ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER tenants_bump_row_version
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

-- 2) tenant_members
CREATE TABLE IF NOT EXISTS public.tenant_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role        public.tenant_role NOT NULL DEFAULT 'member',
  status      public.tenant_member_status NOT NULL DEFAULT 'active',
  row_version bigint NOT NULL DEFAULT 1,
  created_by  uuid REFERENCES public.users(id),
  updated_by  uuid REFERENCES public.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_members_unique_user UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS tenant_members_user_idx ON public.tenant_members(user_id);
CREATE INDEX IF NOT EXISTS tenant_members_tenant_status_idx ON public.tenant_members(tenant_id, status);

GRANT SELECT ON public.tenant_members TO authenticated;
GRANT ALL ON public.tenant_members TO service_role;

ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER tenant_members_bump_row_version
  BEFORE UPDATE ON public.tenant_members
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

-- 3) Helpers (fail-closed)
CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = _tenant_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_tenant_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_tenant_role(_tenant_id uuid, _role public.tenant_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = _tenant_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND role = _role
  );
$$;

REVOKE ALL ON FUNCTION public.has_tenant_role(uuid, public.tenant_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_tenant_role(uuid, public.tenant_role) TO authenticated, service_role;

-- 4) RLS policies
CREATE POLICY "tenants_member_select" ON public.tenants
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(id));

CREATE POLICY "tenant_members_self_select" ON public.tenant_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_tenant_member(tenant_id)
  );

CREATE POLICY "tenant_members_admin_manage" ON public.tenant_members
  FOR ALL TO authenticated
  USING (
    public.has_tenant_role(tenant_id, 'tenant_owner')
    OR public.has_tenant_role(tenant_id, 'tenant_admin')
  )
  WITH CHECK (
    public.has_tenant_role(tenant_id, 'tenant_owner')
    OR public.has_tenant_role(tenant_id, 'tenant_admin')
  );
