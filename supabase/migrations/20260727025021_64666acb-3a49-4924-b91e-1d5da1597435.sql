-- Column-level revoke: token_hash must never round-trip to authenticated clients.
REVOKE SELECT (token_hash) ON public.tenant_invitations FROM anon, authenticated;
-- Explicitly grant SELECT of safe columns to preserve normal listing.
GRANT SELECT (id, tenant_id, email, role, status, expires_at, invited_by, accepted_by, accepted_at, revoked_at, row_version, created_at, updated_at) ON public.tenant_invitations TO authenticated;
GRANT SELECT ON public.tenant_invitations TO service_role;

COMMENT ON COLUMN public.tenant_invitations.token_hash IS
'SHA-256 of the plaintext token. NEVER exposed to end-user roles; only service_role can select this column. Plaintext token is returned exactly once by create_tenant_invitation and never persisted in the clear.';