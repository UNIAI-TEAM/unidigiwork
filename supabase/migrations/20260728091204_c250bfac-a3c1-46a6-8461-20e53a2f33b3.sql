
REVOKE ALL ON FUNCTION public.refresh_entitlements(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_entitlements(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.provision_default_subscription(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_default_subscription(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.record_usage(uuid, text, bigint, text, text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_usage(uuid, text, bigint, text, text, uuid, jsonb) TO service_role;
-- authenticated NOT granted: usage recording only via trusted server fn using service role.

REVOKE ALL ON FUNCTION public.change_subscription(uuid, text, text, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_subscription(uuid, text, text, text, bigint) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.check_quota(uuid, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_quota(uuid, text, bigint) TO authenticated, service_role;
