-- =========================================================================
-- BATCH 1B — Tenant Lifecycle, Workspace Provisioning, Membership, Invitations
-- Corrective migration + trusted provisioning + lifecycle RPCs.
-- =========================================================================

-- 1. Remove buggy auto-tenant trigger (defect from Batch 0B).
DROP TRIGGER IF EXISTS on_workspace_created_tenant ON public.workspaces;
DROP FUNCTION IF EXISTS public.handle_new_workspace_tenant();

-- 2. Reserved-slug guard.
CREATE OR REPLACE FUNCTION public.is_reserved_slug(_slug text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(_slug) = ANY (ARRAY[
    'admin','api','app','auth','login','logout','platform','system','support','www',
    'root','settings','billing','public','static','internal','uniwork'
  ]);
$$;

-- 3. Tenant invitations table.
CREATE TABLE IF NOT EXISTS public.tenant_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.tenant_role NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'pending',
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  invited_by UUID REFERENCES public.users(id),
  accepted_by UUID REFERENCES public.users(id),
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  row_version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_invitations_status_chk CHECK (status IN ('pending','accepted','expired','revoked'))
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_invitations_token_uniq ON public.tenant_invitations(token_hash);
CREATE INDEX IF NOT EXISTS tenant_invitations_tenant_idx ON public.tenant_invitations(tenant_id, status);
CREATE INDEX IF NOT EXISTS tenant_invitations_email_idx ON public.tenant_invitations(lower(email));

GRANT SELECT ON public.tenant_invitations TO authenticated;
GRANT ALL ON public.tenant_invitations TO service_role;

ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_invitations_admin_select ON public.tenant_invitations
  FOR SELECT TO authenticated
  USING (
    public.has_tenant_role(tenant_id, 'tenant_owner')
    OR public.has_tenant_role(tenant_id, 'tenant_admin')
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE TRIGGER tenant_invitations_bump_row_version
  BEFORE UPDATE ON public.tenant_invitations
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

-- 4. Platform admin can read tenants / tenant_members metadata.
DROP POLICY IF EXISTS tenants_admin_select ON public.tenants;
CREATE POLICY tenants_admin_select ON public.tenants
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS tenant_members_admin_select ON public.tenant_members;
CREATE POLICY tenant_members_admin_select ON public.tenant_members
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. Provision tenant RPC — trusted, transactional, idempotent.
CREATE OR REPLACE FUNCTION public.provision_tenant(
  _name TEXT,
  _slug TEXT,
  _owner_id UUID,
  _default_workspace_name TEXT,
  _idempotency_key TEXT DEFAULT NULL,
  _correlation_id TEXT DEFAULT NULL
) RETURNS TABLE (tenant_id UUID, workspace_id UUID, membership_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tenant_id UUID;
  _workspace_id UUID;
  _member_id UUID;
  _actor UUID := auth.uid();
  _existing UUID;
  _norm_slug TEXT := lower(regexp_replace(_slug, '[^a-z0-9-]+', '-', 'g'));
BEGIN
  -- Authorization: caller must be platform admin OR provisioning for themselves.
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000';
  END IF;
  IF _actor <> _owner_id AND NOT public.has_role(_actor, 'admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  -- Slug validation.
  IF length(_norm_slug) < 3 OR length(_norm_slug) > 63 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: slug length' USING ERRCODE = '22000';
  END IF;
  IF public.is_reserved_slug(_norm_slug) THEN
    RAISE EXCEPTION 'TENANT_SLUG_CONFLICT: reserved' USING ERRCODE = '23505';
  END IF;

  -- Idempotency: if key was used for a prior successful provision, return same result.
  IF _idempotency_key IS NOT NULL THEN
    SELECT (payload->>'tenant_id')::uuid INTO _existing
    FROM public.audit_events
    WHERE event_type = 'tenant.provisioned'
      AND idempotency_key = _idempotency_key
    LIMIT 1;
    IF _existing IS NOT NULL THEN
      RETURN QUERY
        SELECT _existing, w.id, tm.id
        FROM public.workspaces w
        JOIN public.tenant_members tm ON tm.tenant_id = _existing AND tm.role = 'tenant_owner'
        WHERE w.tenant_id = _existing
        ORDER BY w.created_at ASC LIMIT 1;
      RETURN;
    END IF;
  END IF;

  -- Slug uniqueness check.
  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = _norm_slug) THEN
    RAISE EXCEPTION 'TENANT_SLUG_CONFLICT' USING ERRCODE = '23505';
  END IF;

  _tenant_id := gen_random_uuid();
  _workspace_id := _tenant_id; -- Batch 0B invariant: workspaces.tenant_id = workspaces.id

  -- Create tenant.
  INSERT INTO public.tenants(id, slug, name, status, created_by, updated_by)
  VALUES (_tenant_id, _norm_slug, _name, 'active', _owner_id, _owner_id);

  -- Create tenant owner membership.
  INSERT INTO public.tenant_members(tenant_id, user_id, role, status, created_by, updated_by)
  VALUES (_tenant_id, _owner_id, 'tenant_owner', 'active', _owner_id, _owner_id)
  RETURNING id INTO _member_id;

  -- Create default workspace (id = tenant_id per Batch 0B invariant).
  INSERT INTO public.workspaces(id, name, owner_id, tenant_id, updated_by)
  VALUES (_workspace_id, _default_workspace_name, _owner_id, _tenant_id, _owner_id);

  -- Workspace member (owner) — handle_new_workspace trigger already inserts.

  -- Audit.
  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, idempotency_key, correlation_id)
  VALUES
    (_tenant_id, _actor, 'tenant.provisioned', 'tenant', _tenant_id::text,
     jsonb_build_object('tenant_id', _tenant_id, 'workspace_id', _workspace_id, 'owner_id', _owner_id, 'slug', _norm_slug),
     _idempotency_key, _correlation_id),
    (_tenant_id, _actor, 'tenant.member_added', 'tenant_member', _member_id::text,
     jsonb_build_object('tenant_id', _tenant_id, 'user_id', _owner_id, 'role', 'tenant_owner'),
     NULL, _correlation_id),
    (_tenant_id, _actor, 'workspace.created', 'workspace', _workspace_id::text,
     jsonb_build_object('workspace_id', _workspace_id, 'tenant_id', _tenant_id, 'name', _default_workspace_name),
     NULL, _correlation_id);

  -- Outbox.
  INSERT INTO public.outbox_events(tenant_id, event_type, event_version, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES
    (_tenant_id, 'tenant.created.v1', 1, 'tenant', _tenant_id::text,
     jsonb_build_object('tenant_id', _tenant_id, 'slug', _norm_slug, 'name', _name), _correlation_id),
    (_tenant_id, 'tenant.member_added.v1', 1, 'tenant_member', _member_id::text,
     jsonb_build_object('tenant_id', _tenant_id, 'user_id', _owner_id, 'role', 'tenant_owner'), _correlation_id),
    (_tenant_id, 'workspace.created.v1', 1, 'workspace', _workspace_id::text,
     jsonb_build_object('workspace_id', _workspace_id, 'tenant_id', _tenant_id, 'name', _default_workspace_name), _correlation_id);

  RETURN QUERY SELECT _tenant_id, _workspace_id, _member_id;
END $$;

REVOKE ALL ON FUNCTION public.provision_tenant(TEXT, TEXT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_tenant(TEXT, TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated;

-- 6. Tenant status transitions.
CREATE OR REPLACE FUNCTION public.change_tenant_status(_tenant_id UUID, _new_status TEXT, _correlation_id TEXT DEFAULT NULL)
RETURNS public.tenants LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor UUID := auth.uid();
  _current TEXT;
  _row public.tenants;
  _event TEXT;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_role(_actor, 'admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO _current FROM public.tenants WHERE id = _tenant_id FOR UPDATE;
  IF _current IS NULL THEN RAISE EXCEPTION 'TENANT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  -- Transition matrix.
  IF _current = 'archived' THEN
    RAISE EXCEPTION 'TENANT_INVALID_TRANSITION' USING ERRCODE = '22000';
  END IF;
  IF _current = _new_status THEN
    SELECT * INTO _row FROM public.tenants WHERE id = _tenant_id;
    RETURN _row;
  END IF;
  IF _new_status NOT IN ('active','suspended','archived') THEN
    RAISE EXCEPTION 'TENANT_INVALID_TRANSITION' USING ERRCODE = '22000';
  END IF;
  IF _current = 'active' AND _new_status = 'active' THEN
    RAISE EXCEPTION 'TENANT_INVALID_TRANSITION' USING ERRCODE = '22000';
  END IF;

  UPDATE public.tenants SET status = _new_status, updated_by = _actor WHERE id = _tenant_id RETURNING * INTO _row;

  _event := CASE _new_status
    WHEN 'suspended' THEN 'tenant.suspended'
    WHEN 'active' THEN 'tenant.reactivated'
    WHEN 'archived' THEN 'tenant.archived'
  END;

  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (_tenant_id, _actor, _event, 'tenant', _tenant_id::text,
          jsonb_build_object('from', _current, 'to', _new_status), _correlation_id);

  INSERT INTO public.outbox_events(tenant_id, event_type, event_version, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (_tenant_id, _event || '.v1', 1, 'tenant', _tenant_id::text,
          jsonb_build_object('tenant_id', _tenant_id, 'from', _current, 'to', _new_status), _correlation_id);

  RETURN _row;
END $$;

REVOKE ALL ON FUNCTION public.change_tenant_status(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_tenant_status(UUID, TEXT, TEXT) TO authenticated;

-- 7. Membership management: change role with owner protection.
CREATE OR REPLACE FUNCTION public.change_tenant_member_role(_tenant_id UUID, _user_id UUID, _new_role public.tenant_role, _correlation_id TEXT DEFAULT NULL)
RETURNS public.tenant_members LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor UUID := auth.uid();
  _current_role public.tenant_role;
  _owner_count INT;
  _row public.tenant_members;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000'; END IF;
  IF NOT (public.has_tenant_role(_tenant_id, 'tenant_owner') OR public.has_role(_actor, 'admin')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO _current_role FROM public.tenant_members
    WHERE tenant_id = _tenant_id AND user_id = _user_id FOR UPDATE;
  IF _current_role IS NULL THEN RAISE EXCEPTION 'TENANT_MEMBERSHIP_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  -- Last owner protection.
  IF _current_role = 'tenant_owner' AND _new_role <> 'tenant_owner' THEN
    SELECT count(*) INTO _owner_count FROM public.tenant_members
      WHERE tenant_id = _tenant_id AND role = 'tenant_owner' AND status = 'active';
    IF _owner_count <= 1 THEN
      RAISE EXCEPTION 'TENANT_LAST_OWNER_PROTECTED' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.tenant_members SET role = _new_role, updated_by = _actor
    WHERE tenant_id = _tenant_id AND user_id = _user_id
    RETURNING * INTO _row;

  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (_tenant_id, _actor, 'tenant.member_role_changed', 'tenant_member', _row.id::text,
          jsonb_build_object('user_id', _user_id, 'from', _current_role, 'to', _new_role), _correlation_id);

  INSERT INTO public.outbox_events(tenant_id, event_type, event_version, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (_tenant_id, 'tenant.member_role_changed.v1', 1, 'tenant_member', _row.id::text,
          jsonb_build_object('tenant_id', _tenant_id, 'user_id', _user_id, 'from', _current_role, 'to', _new_role), _correlation_id);

  RETURN _row;
END $$;

REVOKE ALL ON FUNCTION public.change_tenant_member_role(UUID, UUID, public.tenant_role, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_tenant_member_role(UUID, UUID, public.tenant_role, TEXT) TO authenticated;

-- 8. Transfer ownership.
CREATE OR REPLACE FUNCTION public.transfer_tenant_ownership(_tenant_id UUID, _new_owner_id UUID, _correlation_id TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor UUID := auth.uid();
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000'; END IF;
  IF NOT (public.has_tenant_role(_tenant_id, 'tenant_owner') OR public.has_role(_actor, 'admin')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = _tenant_id AND user_id = _new_owner_id AND status = 'active') THEN
    RAISE EXCEPTION 'TENANT_MEMBERSHIP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.tenant_members SET role = 'tenant_owner', updated_by = _actor
    WHERE tenant_id = _tenant_id AND user_id = _new_owner_id;

  UPDATE public.tenant_members SET role = 'tenant_admin', updated_by = _actor
    WHERE tenant_id = _tenant_id AND user_id = _actor AND role = 'tenant_owner';

  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (_tenant_id, _actor, 'tenant.ownership_transferred', 'tenant', _tenant_id::text,
          jsonb_build_object('from', _actor, 'to', _new_owner_id), _correlation_id);

  INSERT INTO public.outbox_events(tenant_id, event_type, event_version, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (_tenant_id, 'tenant.ownership_transferred.v1', 1, 'tenant', _tenant_id::text,
          jsonb_build_object('tenant_id', _tenant_id, 'from', _actor, 'to', _new_owner_id), _correlation_id);
END $$;

REVOKE ALL ON FUNCTION public.transfer_tenant_ownership(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_tenant_ownership(UUID, UUID, TEXT) TO authenticated;

-- 9. Suspend / remove member (with owner protection).
CREATE OR REPLACE FUNCTION public.change_tenant_member_status(_tenant_id UUID, _user_id UUID, _new_status public.tenant_member_status, _correlation_id TEXT DEFAULT NULL)
RETURNS public.tenant_members LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor UUID := auth.uid();
  _row public.tenant_members;
  _owner_count INT;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000'; END IF;
  IF NOT (public.has_tenant_role(_tenant_id, 'tenant_owner') OR public.has_tenant_role(_tenant_id, 'tenant_admin') OR public.has_role(_actor, 'admin')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row FROM public.tenant_members WHERE tenant_id = _tenant_id AND user_id = _user_id FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'TENANT_MEMBERSHIP_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;

  IF _row.role = 'tenant_owner' AND _new_status <> 'active' THEN
    SELECT count(*) INTO _owner_count FROM public.tenant_members
      WHERE tenant_id = _tenant_id AND role = 'tenant_owner' AND status = 'active';
    IF _owner_count <= 1 THEN
      RAISE EXCEPTION 'TENANT_LAST_OWNER_PROTECTED' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.tenant_members SET status = _new_status, updated_by = _actor
    WHERE id = _row.id RETURNING * INTO _row;

  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (_tenant_id, _actor, 'tenant.member_status_changed', 'tenant_member', _row.id::text,
          jsonb_build_object('user_id', _user_id, 'status', _new_status), _correlation_id);

  RETURN _row;
END $$;

REVOKE ALL ON FUNCTION public.change_tenant_member_status(UUID, UUID, public.tenant_member_status, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_tenant_member_status(UUID, UUID, public.tenant_member_status, TEXT) TO authenticated;

-- 10. Invitations RPC.
CREATE OR REPLACE FUNCTION public.create_tenant_invitation(_tenant_id UUID, _email TEXT, _role public.tenant_role, _token_hash TEXT, _expires_at TIMESTAMPTZ, _correlation_id TEXT DEFAULT NULL)
RETURNS public.tenant_invitations LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor UUID := auth.uid();
  _row public.tenant_invitations;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000'; END IF;
  IF NOT (public.has_tenant_role(_tenant_id, 'tenant_owner') OR public.has_tenant_role(_tenant_id, 'tenant_admin')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF _role = 'tenant_owner' THEN
    RAISE EXCEPTION 'TENANT_ROLE_CHANGE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF _expires_at <= now() THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: expires_at' USING ERRCODE = '22000';
  END IF;

  INSERT INTO public.tenant_invitations(tenant_id, email, role, token_hash, expires_at, invited_by)
  VALUES (_tenant_id, lower(_email), _role, _token_hash, _expires_at, _actor)
  RETURNING * INTO _row;

  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (_tenant_id, _actor, 'tenant.member_invited', 'tenant_invitation', _row.id::text,
          jsonb_build_object('email', lower(_email), 'role', _role), _correlation_id);

  INSERT INTO public.outbox_events(tenant_id, event_type, event_version, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (_tenant_id, 'tenant.member_invited.v1', 1, 'tenant_invitation', _row.id::text,
          jsonb_build_object('tenant_id', _tenant_id, 'invitation_id', _row.id, 'email', lower(_email), 'role', _role), _correlation_id);

  RETURN _row;
END $$;

REVOKE ALL ON FUNCTION public.create_tenant_invitation(UUID, TEXT, public.tenant_role, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_tenant_invitation(UUID, TEXT, public.tenant_role, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;

-- 11. Revoke invitation.
CREATE OR REPLACE FUNCTION public.revoke_tenant_invitation(_invitation_id UUID, _correlation_id TEXT DEFAULT NULL)
RETURNS public.tenant_invitations LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor UUID := auth.uid();
  _row public.tenant_invitations;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000'; END IF;
  SELECT * INTO _row FROM public.tenant_invitations WHERE id = _invitation_id FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'TENANT_INVITATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT (public.has_tenant_role(_row.tenant_id, 'tenant_owner') OR public.has_tenant_role(_row.tenant_id, 'tenant_admin')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF _row.status <> 'pending' THEN
    RAISE EXCEPTION 'TENANT_INVALID_TRANSITION' USING ERRCODE = '22000';
  END IF;
  UPDATE public.tenant_invitations SET status = 'revoked', revoked_at = now() WHERE id = _invitation_id RETURNING * INTO _row;
  RETURN _row;
END $$;

REVOKE ALL ON FUNCTION public.revoke_tenant_invitation(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_tenant_invitation(UUID, TEXT) TO authenticated;

-- 12. Accept invitation.
CREATE OR REPLACE FUNCTION public.accept_tenant_invitation(_token_hash TEXT, _correlation_id TEXT DEFAULT NULL)
RETURNS public.tenant_members LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor UUID := auth.uid();
  _inv public.tenant_invitations;
  _member public.tenant_members;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000'; END IF;
  SELECT * INTO _inv FROM public.tenant_invitations WHERE token_hash = _token_hash FOR UPDATE;
  IF _inv.id IS NULL THEN RAISE EXCEPTION 'TENANT_INVITATION_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF _inv.status = 'revoked' THEN RAISE EXCEPTION 'TENANT_INVITATION_REVOKED' USING ERRCODE = '42501'; END IF;
  IF _inv.status = 'accepted' THEN RAISE EXCEPTION 'TENANT_INVITATION_ALREADY_ACCEPTED' USING ERRCODE = '42501'; END IF;
  IF _inv.expires_at <= now() THEN
    UPDATE public.tenant_invitations SET status = 'expired' WHERE id = _inv.id;
    RAISE EXCEPTION 'TENANT_INVITATION_EXPIRED' USING ERRCODE = '42501';
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
END $$;

REVOKE ALL ON FUNCTION public.accept_tenant_invitation(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invitation(TEXT, TEXT) TO authenticated;
