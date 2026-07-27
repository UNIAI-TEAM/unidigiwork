-- 1) Trusted rejection audit sink — callable only by server-side trusted code.
CREATE OR REPLACE FUNCTION public.record_tenant_invitation_rejection(
  _invitation_id uuid,
  _actor_id uuid,
  _reason_code text,
  _correlation_id text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id uuid;
  _idem text;
  _existing uuid;
  _event_type text;
  _audit_id uuid;
  _allowed text[] := ARRAY[
    'TENANT_INVITATION_EMAIL_MISMATCH',
    'TENANT_INVITATION_EXPIRED',
    'TENANT_INVITATION_REVOKED',
    'TENANT_INVITATION_ALREADY_ACCEPTED',
    'TENANT_INVITATION_NOT_FOUND',
    'TENANT_INVITATION_MEMBERSHIP_INACTIVE',
    'AUTHENTICATION_REQUIRED'
  ];
BEGIN
  IF _invitation_id IS NULL OR _reason_code IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: invitation_id/reason_code required' USING ERRCODE = '22000';
  END IF;
  IF NOT (_reason_code = ANY(_allowed)) THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: reason_code not allowed (%)', _reason_code USING ERRCODE = '22000';
  END IF;

  SELECT tenant_id INTO _tenant_id FROM public.tenant_invitations WHERE id = _invitation_id;
  -- If invitation truly does not exist, still record with NULL tenant is not allowed by FK; skip.
  IF _tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  _event_type := 'tenant.invitation_rejected';
  _idem := 'rejection:' || _invitation_id::text || ':' || COALESCE(_actor_id::text, 'anon') || ':' || _reason_code;

  -- Idempotency dedup.
  SELECT id INTO _existing FROM public.audit_events
    WHERE idempotency_key = _idem AND event_type = _event_type
    LIMIT 1;
  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  INSERT INTO public.audit_events(
    tenant_id, actor_id, event_type, aggregate_type, aggregate_id,
    payload, idempotency_key, correlation_id
  ) VALUES (
    _tenant_id, _actor_id, _event_type, 'tenant_invitation', _invitation_id::text,
    jsonb_build_object(
      'invitation_id', _invitation_id,
      'reason_code', _reason_code
    ),
    _idem, _correlation_id
  ) RETURNING id INTO _audit_id;

  RETURN _audit_id;
END $$;

-- Lock down: only trusted server (service_role) may call.
REVOKE ALL ON FUNCTION public.record_tenant_invitation_rejection(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_tenant_invitation_rejection(uuid, uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_tenant_invitation_rejection(uuid, uuid, text, text) TO service_role;

-- 2) accept_tenant_invitation: remove the pre-RAISE audit insert on email mismatch
--    (it always rolls back with the exception). Rejection audit is now written by
--    record_tenant_invitation_rejection through the trusted server boundary.
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
  _existing public.tenant_members;
  _caller_email TEXT;
  _caller_email_verified BOOLEAN;
  _inv_email_norm TEXT;
  _caller_email_norm TEXT;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000'; END IF;

  SELECT u.email, COALESCE((u.email_confirmed_at IS NOT NULL), FALSE)
    INTO _caller_email, _caller_email_verified
  FROM auth.users u WHERE u.id = _actor;

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

  _inv_email_norm := lower(btrim(_inv.email));
  _caller_email_norm := lower(btrim(_caller_email));
  IF _inv_email_norm <> _caller_email_norm THEN
    RAISE EXCEPTION 'TENANT_INVITATION_EMAIL_MISMATCH' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _existing FROM public.tenant_members
    WHERE tenant_id = _inv.tenant_id AND user_id = _actor FOR UPDATE;
  IF _existing.id IS NOT NULL AND _existing.status <> 'active' THEN
    RAISE EXCEPTION 'TENANT_INVALID_TRANSITION' USING ERRCODE = '22000';
  END IF;

  INSERT INTO public.tenant_members(tenant_id, user_id, role, status, created_by, updated_by)
  VALUES (_inv.tenant_id, _actor, _inv.role, 'active', _actor, _actor)
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role, updated_by = EXCLUDED.updated_by
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