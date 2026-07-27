-- SEC.3 corrective: align audit_events schema with lifecycle RPC expectations.
ALTER TABLE public.audit_events
  ADD COLUMN IF NOT EXISTS actor_id UUID,
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS aggregate_type TEXT,
  ADD COLUMN IF NOT EXISTS aggregate_id TEXT,
  ADD COLUMN IF NOT EXISTS payload JSONB,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Backfill actor_id from legacy actor_user_id where possible.
UPDATE public.audit_events SET actor_id = actor_user_id WHERE actor_id IS NULL AND actor_user_id IS NOT NULL;

-- Legacy NOT NULL columns are unused by new RPCs — relax them.
ALTER TABLE public.audit_events
  ALTER COLUMN action DROP NOT NULL,
  ALTER COLUMN resource_type DROP NOT NULL,
  ALTER COLUMN source DROP NOT NULL;

CREATE INDEX IF NOT EXISTS audit_events_aggregate_idx
  ON public.audit_events (aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS audit_events_event_type_idx
  ON public.audit_events (event_type);

-- SEC.3 XV: invitation acceptance must not silently bypass suspended/removed state.
CREATE OR REPLACE FUNCTION public.accept_tenant_invitation(_token_hash text, _correlation_id text DEFAULT NULL::text)
 RETURNS public.tenant_members
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
    INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
    VALUES (_inv.tenant_id, _actor, 'tenant.invitation_email_mismatch', 'tenant_invitation', _inv.id::text,
            jsonb_build_object('invitation_id', _inv.id), _correlation_id);
    RAISE EXCEPTION 'TENANT_INVITATION_EMAIL_MISMATCH' USING ERRCODE = '42501';
  END IF;

  -- SEC.3 XV: check pre-existing membership. Suspended/removed must not be silently reactivated by an invitation.
  SELECT * INTO _existing FROM public.tenant_members
    WHERE tenant_id = _inv.tenant_id AND user_id = _actor FOR UPDATE;
  IF _existing.id IS NOT NULL AND _existing.status <> 'active' THEN
    INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
    VALUES (_inv.tenant_id, _actor, 'tenant.invitation_membership_inactive_rejected', 'tenant_invitation', _inv.id::text,
            jsonb_build_object('invitation_id', _inv.id, 'existing_status', _existing.status), _correlation_id);
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

-- Preserve least-privilege grants from SEC.1
REVOKE EXECUTE ON FUNCTION public.accept_tenant_invitation(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invitation(text, text) TO authenticated, service_role;