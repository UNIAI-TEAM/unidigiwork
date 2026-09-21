-- Platform console: cho phép quản trị viên nền tảng vào một tổ chức để quản trị hộ.
-- Ghi audit rõ ràng; không bỏ qua RLS ở phía ứng dụng.
CREATE OR REPLACE FUNCTION public.platform_admin_join_tenant(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _status text;
  _existing public.tenant_members;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_role(_actor, 'admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO _status FROM public.tenants WHERE id = _tenant_id;
  IF _status IS NULL THEN RAISE EXCEPTION 'TENANT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF _status <> 'active' THEN RAISE EXCEPTION 'TENANT_INVALID_TRANSITION' USING ERRCODE = '22000'; END IF;

  SELECT * INTO _existing FROM public.tenant_members
   WHERE tenant_id = _tenant_id AND user_id = _actor;

  IF _existing.id IS NULL THEN
    INSERT INTO public.tenant_members(tenant_id, user_id, role, status, created_by, updated_by)
    VALUES (_tenant_id, _actor, 'tenant_admin', 'active', _actor, _actor);
  ELSIF _existing.status <> 'active' THEN
    UPDATE public.tenant_members
       SET status = 'active', updated_by = _actor, updated_at = now(), row_version = row_version + 1
     WHERE id = _existing.id;
  END IF;

  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload)
  VALUES (_tenant_id, _actor, 'tenant.platform_admin_joined', 'tenant', _tenant_id::text,
          jsonb_build_object('tenant_id', _tenant_id, 'actor_id', _actor));

  RETURN jsonb_build_object('ok', true, 'tenant_id', _tenant_id);
END $function$;

REVOKE ALL ON FUNCTION public.platform_admin_join_tenant(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_admin_join_tenant(uuid) TO authenticated, service_role;