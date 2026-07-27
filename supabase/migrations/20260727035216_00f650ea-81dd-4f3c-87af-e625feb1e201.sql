CREATE OR REPLACE FUNCTION public.provision_tenant(
  _name text, _slug text, _owner_id uuid, _default_workspace_name text,
  _idempotency_key text DEFAULT NULL::text, _correlation_id text DEFAULT NULL::text
)
RETURNS TABLE(tenant_id uuid, workspace_id uuid, membership_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _tenant_id UUID;
  _workspace_id UUID;
  _member_id UUID;
  _actor UUID := auth.uid();
  _existing_tenant UUID;
  _existing_fp TEXT;
  _fp TEXT;
  _norm_slug TEXT := regexp_replace(lower(coalesce(_slug,'')), '[^a-z0-9-]+', '-', 'g');
BEGIN
  IF _actor IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000';
  END IF;
  IF _actor <> _owner_id AND NOT public.has_role(_actor, 'admin') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  IF length(_norm_slug) < 3 OR length(_norm_slug) > 63 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: slug length' USING ERRCODE = '22000';
  END IF;
  IF public.is_reserved_slug(_norm_slug) THEN
    RAISE EXCEPTION 'TENANT_SLUG_CONFLICT: reserved' USING ERRCODE = '23505';
  END IF;

  _fp := md5(coalesce(_name,'') || '|' || _norm_slug || '|' || _owner_id::text || '|' || coalesce(_default_workspace_name,''));

  IF _idempotency_key IS NOT NULL THEN
    SELECT (payload->>'tenant_id')::uuid, payload->>'fingerprint'
      INTO _existing_tenant, _existing_fp
      FROM public.audit_events
      WHERE event_type = 'tenant.provisioned' AND idempotency_key = _idempotency_key
      LIMIT 1;
    IF _existing_tenant IS NOT NULL THEN
      IF _existing_fp IS NOT NULL AND _existing_fp <> _fp THEN
        RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
      END IF;
      RETURN QUERY
        SELECT _existing_tenant, w.id, tm.id
        FROM public.workspaces w
        JOIN public.tenant_members tm ON tm.tenant_id = _existing_tenant AND tm.role = 'tenant_owner'
        WHERE w.tenant_id = _existing_tenant
        ORDER BY w.created_at ASC LIMIT 1;
      RETURN;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.tenants WHERE slug = _norm_slug) THEN
    RAISE EXCEPTION 'TENANT_SLUG_CONFLICT' USING ERRCODE = '23505';
  END IF;

  _tenant_id := gen_random_uuid();
  _workspace_id := _tenant_id;

  INSERT INTO public.tenants(id, slug, name, status, created_by, updated_by)
  VALUES (_tenant_id, _norm_slug, _name, 'active', _owner_id, _owner_id);

  INSERT INTO public.tenant_members(tenant_id, user_id, role, status, created_by, updated_by)
  VALUES (_tenant_id, _owner_id, 'tenant_owner', 'active', _owner_id, _owner_id)
  RETURNING id INTO _member_id;

  INSERT INTO public.workspaces(id, name, owner_id, tenant_id, updated_by)
  VALUES (_workspace_id, _default_workspace_name, _owner_id, _tenant_id, _owner_id);

  BEGIN
    INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, idempotency_key, correlation_id)
    VALUES
      (_tenant_id, _actor, 'tenant.provisioned', 'tenant', _tenant_id::text,
       jsonb_build_object('tenant_id', _tenant_id, 'workspace_id', _workspace_id, 'owner_id', _owner_id, 'slug', _norm_slug, 'fingerprint', _fp),
       _idempotency_key, _correlation_id);
  EXCEPTION WHEN unique_violation THEN
    SELECT (payload->>'tenant_id')::uuid INTO _existing_tenant
      FROM public.audit_events
      WHERE event_type = 'tenant.provisioned' AND idempotency_key = _idempotency_key
      LIMIT 1;
    IF _existing_tenant IS NULL THEN RAISE; END IF;
    RAISE EXCEPTION 'IDEMPOTENCY_REPLAY_RACE' USING ERRCODE = '40001';
  END;

  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES
    (_tenant_id, _actor, 'tenant.member_added', 'tenant_member', _member_id::text,
     jsonb_build_object('tenant_id', _tenant_id, 'user_id', _owner_id, 'role', 'tenant_owner'), _correlation_id),
    (_tenant_id, _actor, 'workspace.created', 'workspace', _workspace_id::text,
     jsonb_build_object('workspace_id', _workspace_id, 'tenant_id', _tenant_id, 'name', _default_workspace_name), _correlation_id);

  INSERT INTO public.outbox_events(tenant_id, event_type, event_version, aggregate_type, aggregate_id, payload, correlation_id, idempotency_key)
  VALUES
    (_tenant_id, 'tenant.created.v1', 1, 'tenant', _tenant_id::text,
     jsonb_build_object('tenant_id', _tenant_id, 'slug', _norm_slug, 'name', _name), _correlation_id, _idempotency_key),
    (_tenant_id, 'tenant.member_added.v1', 1, 'tenant_member', _member_id::text,
     jsonb_build_object('tenant_id', _tenant_id, 'user_id', _owner_id, 'role', 'tenant_owner'), _correlation_id, NULL),
    (_tenant_id, 'workspace.created.v1', 1, 'workspace', _workspace_id::text,
     jsonb_build_object('workspace_id', _workspace_id, 'tenant_id', _tenant_id, 'name', _default_workspace_name), _correlation_id, NULL);

  RETURN QUERY SELECT _tenant_id, _workspace_id, _member_id;
END $function$;

REVOKE ALL ON FUNCTION public.provision_tenant(text,text,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text,text,uuid,text,text,text) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';