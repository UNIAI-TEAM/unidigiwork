-- Test-only helper: seed/override entitlements for tenants prefixed `itest_`.
-- Called by tests/integration/*.sql via psql. Refuses to run against real tenants.
CREATE OR REPLACE FUNCTION public._test_seed_entitlement(
  _tenant_id uuid,
  _feature_key text,
  _enabled boolean,
  _quota_limit bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = _tenant_id
      AND name LIKE 'itest\_%' ESCAPE '\'
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: _test_seed_entitlement restricted to itest_ tenants'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.entitlements(tenant_id, feature_key, enabled, quota_limit, source)
  VALUES (_tenant_id, _feature_key, _enabled, _quota_limit, 'test')
  ON CONFLICT (tenant_id, feature_key)
  DO UPDATE SET enabled = EXCLUDED.enabled,
                quota_limit = EXCLUDED.quota_limit,
                source = 'test',
                updated_at = now();
END $$;

REVOKE ALL ON FUNCTION public._test_seed_entitlement(uuid, text, boolean, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._test_seed_entitlement(uuid, text, boolean, bigint) TO PUBLIC;
COMMENT ON FUNCTION public._test_seed_entitlement(uuid, text, boolean, bigint) IS
  'Integration-test helper. Only mutates entitlements for tenants named itest_%; requires an authenticated caller.';