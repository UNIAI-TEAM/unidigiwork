CREATE OR REPLACE FUNCTION public._test_set_tenant_member(_tenant_id uuid, _user_id uuid, _role tenant_role DEFAULT 'member', _status tenant_member_status DEFAULT 'active')
RETURNS public.tenant_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _m public.tenant_members;
BEGIN
  INSERT INTO public.tenant_members(tenant_id, user_id, role, status, created_by, updated_by)
  VALUES (_tenant_id, _user_id, _role, _status, _user_id, _user_id)
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status, updated_by = EXCLUDED.updated_by
  RETURNING * INTO _m;
  RETURN _m;
END $$;

REVOKE ALL ON FUNCTION public._test_set_tenant_member(uuid, uuid, tenant_role, tenant_member_status) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._test_set_tenant_member(uuid, uuid, tenant_role, tenant_member_status) TO service_role;