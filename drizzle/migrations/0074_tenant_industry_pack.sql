ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS industry_pack text NOT NULL DEFAULT 'business';
ALTER TABLE public.tenants ADD CONSTRAINT tenants_industry_pack_check CHECK (industry_pack IN ('business','school'));
COMMENT ON COLUMN public.tenants.industry_pack IS 'Industry configuration overlay (labels/templates/skills). Does not change core behavior.';

CREATE OR REPLACE FUNCTION public.get_tenant_industry_pack(_tenant_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.industry_pack FROM public.tenants t
  WHERE t.id = _tenant_id AND t.deleted_at IS NULL
    AND (EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id = t.id AND m.user_id = auth.uid() AND m.status = 'active')
         OR public.has_role(auth.uid(), 'admin'))
$$;

CREATE OR REPLACE FUNCTION public.set_tenant_industry_pack(_tenant_id uuid, _pack text, _idempotency_key text DEFAULT NULL, _correlation_id text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _from text;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000'; END IF;
  IF _pack NOT IN ('business','school') THEN RAISE EXCEPTION 'VALIDATION_FAILED' USING ERRCODE = '22023'; END IF;
  IF NOT (public.has_tenant_role(_tenant_id,'tenant_owner') OR public.has_tenant_role(_tenant_id,'tenant_admin') OR public.has_role(_actor,'admin')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT industry_pack INTO _from FROM public.tenants WHERE id = _tenant_id FOR UPDATE;
  IF _from IS NULL THEN RAISE EXCEPTION 'TENANT_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF _from = _pack THEN RETURN _pack; END IF;
  UPDATE public.tenants SET industry_pack = _pack, updated_by = _actor WHERE id = _tenant_id;
  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (_tenant_id, _actor, 'tenant.industry_pack_changed', 'tenant', _tenant_id::text, jsonb_build_object('from',_from,'to',_pack), _correlation_id);
  PERFORM public._emit_outbox_event(_tenant_id, 'tenant.industry_pack_changed.v1', 'tenant', _tenant_id::text,
    jsonb_build_object('tenant_id',_tenant_id,'from',_from,'to',_pack), _idempotency_key, _correlation_id);
  RETURN _pack;
END $$;

REVOKE ALL ON FUNCTION public.get_tenant_industry_pack(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_tenant_industry_pack(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_industry_pack(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_tenant_industry_pack(uuid,text,text,text) TO authenticated, service_role;