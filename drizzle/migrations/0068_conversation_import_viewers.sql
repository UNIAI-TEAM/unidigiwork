ALTER TABLE public.conversation_imports DROP CONSTRAINT conversation_imports_visibility_check;
ALTER TABLE public.conversation_imports ADD CONSTRAINT conversation_imports_visibility_check
  CHECK (visibility IN ('PRIVATE','TENANT','PROJECT','SELECTED'));

CREATE TABLE IF NOT EXISTS public.conversation_import_viewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  import_id uuid NOT NULL REFERENCES public.conversation_imports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (import_id, user_id)
);
GRANT SELECT ON public.conversation_import_viewers TO authenticated;
GRANT ALL ON public.conversation_import_viewers TO service_role;
ALTER TABLE public.conversation_import_viewers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_conversation_import(_import_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_imports ci
    WHERE ci.id = _import_id
      AND public.is_tenant_member(ci.tenant_id)
      AND (
        ci.imported_by = auth.uid()
        OR ci.visibility = 'TENANT'
        OR (ci.visibility = 'PROJECT' AND ci.workspace_id IS NOT NULL
            AND public.is_workspace_member(ci.workspace_id, auth.uid()))
        OR (ci.visibility = 'SELECTED' AND EXISTS (
            SELECT 1 FROM public.conversation_import_viewers v
            WHERE v.import_id = ci.id AND v.user_id = auth.uid()))
      )
  )
$$;
REVOKE ALL ON FUNCTION public.can_view_conversation_import(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_conversation_import(uuid) TO authenticated, service_role;

CREATE POLICY "conversation_import_viewers_select" ON public.conversation_import_viewers
  FOR SELECT TO authenticated USING (public.can_view_conversation_import(import_id));

DROP POLICY IF EXISTS "conversation_imports_select" ON public.conversation_imports;
CREATE POLICY "conversation_imports_select" ON public.conversation_imports
  FOR SELECT TO authenticated USING (public.can_view_conversation_import(id));

DROP POLICY IF EXISTS "conversation_import_messages_select" ON public.conversation_import_messages;
CREATE POLICY "conversation_import_messages_select" ON public.conversation_import_messages
  FOR SELECT TO authenticated USING (public.can_view_conversation_import(import_id));

CREATE OR REPLACE FUNCTION public.can_access_conversation_source(_source_type text, _source_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _source_type = 'CHAT_CHANNEL' THEN
    RETURN coalesce(public.is_chat_member(_source_id, auth.uid()), false);
  ELSIF _source_type = 'IMPORT' THEN
    RETURN public.can_view_conversation_import(_source_id);
  END IF;
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.set_conversation_import_visibility(
  _import_id uuid, _visibility text, _viewer_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ci public.conversation_imports; _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
  SELECT * INTO _ci FROM public.conversation_imports WHERE id = _import_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'IMPORT_NOT_FOUND'; END IF;
  IF NOT (_ci.imported_by = _uid
          OR public.has_tenant_role(_ci.tenant_id, 'tenant_owner')
          OR public.has_tenant_role(_ci.tenant_id, 'tenant_admin')) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF _visibility NOT IN ('PRIVATE','TENANT','PROJECT','SELECTED') THEN RAISE EXCEPTION 'INVALID_VISIBILITY'; END IF;
  IF _visibility = 'PROJECT' AND _ci.workspace_id IS NULL THEN RAISE EXCEPTION 'PROJECT_REQUIRED'; END IF;
  UPDATE public.conversation_imports SET visibility = _visibility, updated_by = _uid, updated_at = now() WHERE id = _import_id;
  DELETE FROM public.conversation_import_viewers WHERE import_id = _import_id;
  IF _visibility = 'SELECTED' THEN
    INSERT INTO public.conversation_import_viewers(tenant_id, import_id, user_id, created_by)
    SELECT _ci.tenant_id, _import_id, u, _uid FROM unnest(coalesce(_viewer_ids, '{}')) u
    WHERE EXISTS (SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = _ci.tenant_id AND tm.user_id = u)
    ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.audit_events(tenant_id, actor_user_id, action, resource_type, resource_id, payload)
  VALUES (_ci.tenant_id, _uid, 'conversation_import.visibility_changed', 'conversation_import', _import_id,
          jsonb_build_object('visibility', _visibility, 'viewers', coalesce(array_length(_viewer_ids,1),0)));
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.set_conversation_import_visibility(uuid, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_conversation_import_visibility(uuid, text, uuid[]) TO authenticated, service_role;