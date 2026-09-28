CREATE TABLE public.industry_pack_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  pack text NOT NULL DEFAULT 'school' CHECK (pack IN ('school')),
  kind text NOT NULL CHECK (kind IN ('template','vocabulary','skill','brief_schedule')),
  item_key text NOT NULL CHECK (char_length(item_key) BETWEEN 1 AND 80),
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  publish_at timestamptz NULL,
  note text NULL,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  updated_by uuid NULL
);
COMMENT ON TABLE public.industry_pack_items IS 'Versioned industry-pack overlay items (templates, vocabulary, skill, brief schedule). tenant_id NULL = UniWork standard. Writes only via save_pack_item/archive_pack_item.';
CREATE INDEX industry_pack_items_lookup ON public.industry_pack_items (pack, kind, item_key, tenant_id, publish_at DESC);

GRANT SELECT ON public.industry_pack_items TO authenticated;
GRANT ALL ON public.industry_pack_items TO service_role;
ALTER TABLE public.industry_pack_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pack items read" ON public.industry_pack_items FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin')
  OR (tenant_id IS NULL AND status = 'published')
  OR (tenant_id IS NOT NULL AND (
        public.has_tenant_role(tenant_id,'tenant_owner') OR public.has_tenant_role(tenant_id,'tenant_admin')
        OR (status = 'published' AND EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id = industry_pack_items.tenant_id AND m.user_id = auth.uid() AND m.status = 'active'))
  ))
);

CREATE OR REPLACE FUNCTION public.list_pack_items(_tenant_id uuid)
RETURNS SETOF public.industry_pack_items LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT * FROM public.industry_pack_items
  WHERE pack = 'school' AND status <> 'archived' AND (tenant_id IS NULL OR tenant_id = _tenant_id)
  ORDER BY kind, item_key, created_at DESC
  LIMIT 500
$$;

CREATE OR REPLACE FUNCTION public.save_pack_item(
  _tenant_id uuid, _kind text, _item_key text, _content jsonb, _status text,
  _publish_at timestamptz DEFAULT NULL, _note text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL, _correlation_id text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _id uuid; _at timestamptz;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000'; END IF;
  IF _kind NOT IN ('template','vocabulary','skill','brief_schedule') OR _status NOT IN ('draft','published')
     OR _item_key IS NULL OR char_length(_item_key) NOT BETWEEN 1 AND 80
     OR _content IS NULL OR jsonb_typeof(_content) <> 'object' OR pg_column_size(_content) > 200000 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED' USING ERRCODE = '22023';
  END IF;
  IF _tenant_id IS NULL THEN
    IF _kind = 'brief_schedule' THEN RAISE EXCEPTION 'VALIDATION_FAILED' USING ERRCODE = '22023'; END IF;
    IF NOT public.has_role(_actor,'admin') THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501'; END IF;
  ELSIF NOT (public.has_tenant_role(_tenant_id,'tenant_owner') OR public.has_tenant_role(_tenant_id,'tenant_admin') OR public.has_role(_actor,'admin')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF _idempotency_key IS NOT NULL THEN
    SELECT (payload->>'item_id')::uuid INTO _id FROM public.audit_events
     WHERE event_type = 'industry_pack.item_saved' AND actor_id = _actor AND payload->>'idempotency_key' = _idempotency_key LIMIT 1;
    IF _id IS NOT NULL THEN RETURN _id; END IF;
  END IF;
  _at := CASE WHEN _status = 'published' THEN COALESCE(_publish_at, now()) ELSE NULL END;
  INSERT INTO public.industry_pack_items(tenant_id, kind, item_key, content, status, publish_at, note, created_by, updated_by)
  VALUES (_tenant_id, _kind, _item_key, _content, _status, _at, left(_note, 500), _actor, _actor) RETURNING id INTO _id;
  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (_tenant_id, _actor, 'industry_pack.item_saved', 'industry_pack_item', _id::text,
    jsonb_build_object('item_id',_id,'kind',_kind,'item_key',_item_key,'status',_status,'publish_at',_at,'idempotency_key',_idempotency_key), _correlation_id);
  IF _tenant_id IS NOT NULL THEN
    PERFORM public._emit_outbox_event(_tenant_id, 'industry_pack.item_saved.v1', 'industry_pack_item', _id::text,
      jsonb_build_object('item_id',_id,'kind',_kind,'item_key',_item_key,'status',_status,'publish_at',_at), _idempotency_key, _correlation_id);
  END IF;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.archive_pack_item(_id uuid, _correlation_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid(); _t uuid; _found boolean;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000'; END IF;
  SELECT tenant_id, true INTO _t, _found FROM public.industry_pack_items WHERE id = _id FOR UPDATE;
  IF NOT COALESCE(_found,false) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF _t IS NULL THEN
    IF NOT public.has_role(_actor,'admin') THEN RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501'; END IF;
  ELSIF NOT (public.has_tenant_role(_t,'tenant_owner') OR public.has_tenant_role(_t,'tenant_admin') OR public.has_role(_actor,'admin')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  UPDATE public.industry_pack_items SET status = 'archived', updated_by = _actor, updated_at = now(), row_version = row_version + 1 WHERE id = _id;
  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (_t, _actor, 'industry_pack.item_archived', 'industry_pack_item', _id::text, jsonb_build_object('item_id',_id), _correlation_id);
END $$;

REVOKE ALL ON FUNCTION public.list_pack_items(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_pack_item(uuid,text,text,jsonb,text,timestamptz,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_pack_item(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pack_items(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_pack_item(uuid,text,text,jsonb,text,timestamptz,text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_pack_item(uuid,text) TO authenticated, service_role;