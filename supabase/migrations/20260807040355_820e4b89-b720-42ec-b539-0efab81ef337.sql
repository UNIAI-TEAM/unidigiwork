CREATE OR REPLACE FUNCTION public.set_workspace_timezone(_workspace_id uuid, _timezone text)
RETURNS TABLE (id uuid, timezone text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
BEGIN
  SELECT w.tenant_id INTO _tenant FROM public.workspaces w WHERE w.id = _workspace_id AND w.deleted_at IS NULL;
  IF _tenant IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.is_workspace_owner(_workspace_id, auth.uid())
    OR public.has_tenant_role(_tenant, 'tenant_owner')
    OR public.has_tenant_role(_tenant, 'tenant_admin')
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names t WHERE t.name = _timezone) THEN
    RAISE EXCEPTION 'INVALID_TIMEZONE' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  UPDATE public.workspaces w
     SET timezone = _timezone, updated_at = now()
   WHERE w.id = _workspace_id
  RETURNING w.id, w.timezone;
END;
$$;

REVOKE ALL ON FUNCTION public.set_workspace_timezone(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_workspace_timezone(uuid, text) TO authenticated;