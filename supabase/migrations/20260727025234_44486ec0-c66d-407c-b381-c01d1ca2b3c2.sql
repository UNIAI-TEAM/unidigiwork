REVOKE ALL ON public.tenant_invitations FROM anon, authenticated;
GRANT SELECT (id, tenant_id, email, role, status, expires_at, invited_by, accepted_by, accepted_at, revoked_at, row_version, created_at, updated_at) ON public.tenant_invitations TO authenticated;
GRANT ALL ON public.tenant_invitations TO service_role;
NOTIFY pgrst, 'reload schema';