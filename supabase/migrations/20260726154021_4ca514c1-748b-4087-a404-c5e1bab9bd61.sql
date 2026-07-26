
CREATE OR REPLACE FUNCTION public.accept_tenant_invitation(_token_hash text, _correlation_id text DEFAULT NULL::text)
 RETURNS tenant_members
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor UUID := auth.uid();
  _inv public.tenant_invitations;
  _member public.tenant_members;
  _caller_email TEXT;
  _caller_email_verified BOOLEAN;
  _inv_email_norm TEXT;
  _caller_email_norm TEXT;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000'; END IF;

  -- Resolve verified email from trusted identity source (auth.users).
  -- Never trust request-body email. Fail-closed if unverified.
  SELECT u.email,
         COALESCE((u.email_confirmed_at IS NOT NULL), FALSE)
    INTO _caller_email, _caller_email_verified
  FROM auth.users u
  WHERE u.id = _actor;

  IF _caller_email IS NULL OR NOT _caller_email_verified THEN
    RAISE EXCEPTION 'TENANT_INVITATION_EMAIL_MISMATCH' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _inv FROM public.tenant_invitations WHERE token_hash = _token_hash FOR UPDATE;
  IF _inv.id IS NULL THEN RAISE EXCEPTION 'TENANT_INVITATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF _inv.status = 'revoked' THEN RAISE EXCEPTION 'TENANT_INVITATION_REVOKED' USING ERRCODE = '42501'; END IF;
  IF _inv.status = 'accepted' THEN RAISE EXCEPTION 'TENANT_INVITATION_ALREADY_ACCEPTED' USING ERRCODE = '42501'; END IF;
  IF _inv.expires_at <= now() THEN
    UPDATE public.tenant_invitations SET status = 'expired' WHERE id = _inv.id;
    RAISE EXCEPTION 'TENANT_INVITATION_EXPIRED' USING ERRCODE = '42501';
  END IF;

  -- Normalize both sides (trim + lowercase) and compare.
  _inv_email_norm := lower(btrim(_inv.email));
  _caller_email_norm := lower(btrim(_caller_email));
  IF _inv_email_norm <> _caller_email_norm THEN
    -- Audit rejected attempt without leaking either email in the error.
    INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
    VALUES (_inv.tenant_id, _actor, 'tenant.invitation_email_mismatch', 'tenant_invitation', _inv.id::text,
            jsonb_build_object('invitation_id', _inv.id), _correlation_id);
    RAISE EXCEPTION 'TENANT_INVITATION_EMAIL_MISMATCH' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.tenant_members(tenant_id, user_id, role, status, created_by, updated_by)
  VALUES (_inv.tenant_id, _actor, _inv.role, 'active', _actor, _actor)
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET status = 'active', role = EXCLUDED.role
  RETURNING * INTO _member;

  UPDATE public.tenant_invitations SET status = 'accepted', accepted_by = _actor, accepted_at = now() WHERE id = _inv.id;

  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (_inv.tenant_id, _actor, 'tenant.member_added', 'tenant_member', _member.id::text,
          jsonb_build_object('via_invitation', _inv.id, 'role', _inv.role), _correlation_id);

  INSERT INTO public.outbox_events(tenant_id, event_type, event_version, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (_inv.tenant_id, 'tenant.member_added.v1', 1, 'tenant_member', _member.id::text,
          jsonb_build_object('tenant_id', _inv.tenant_id, 'user_id', _actor, 'role', _inv.role), _correlation_id);

  RETURN _member;
END $function$;

-- Least-privilege: no PUBLIC/anon execute; browser calls via authenticated only.
REVOKE ALL ON FUNCTION public.accept_tenant_invitation(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_tenant_invitation(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invitation(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invitation(text, text) TO service_role;
