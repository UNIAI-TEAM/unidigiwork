CREATE OR REPLACE FUNCTION public.can_access_document(_document_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.documents d
    where d.id = _document_id
      and (
        public.is_workspace_member(d.workspace_id, auth.uid())
        or d.created_by = auth.uid()
        or exists (
          select 1 from public.document_permissions p
          where p.document_id = d.id
            and (
              (p.principal_type = 'user' and p.principal_id = auth.uid())
              or (p.principal_type = 'workspace' and public.is_workspace_member(p.principal_id, auth.uid()))
              or (p.principal_type = 'tenant' and public.is_tenant_member(p.principal_id))
            )
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_document_shares(_document_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.documents d
    where d.id = _document_id
      and d.deleted_at is null
      and (
        d.created_by = auth.uid()
        or public.is_workspace_member(d.workspace_id, auth.uid())
        or exists (
          select 1 from public.document_permissions p
          where p.document_id = d.id
            and p.level = 'manage'
            and p.principal_type = 'user'
            and p.principal_id = auth.uid()
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.share_document(_document_id uuid, _principal_type text, _principal_id uuid, _level text, _idempotency_key text DEFAULT NULL::text, _correlation_id text DEFAULT NULL::text)
 RETURNS document_permissions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _actor uuid := auth.uid(); _doc public.documents; _perm public.document_permissions;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _doc FROM public.documents WHERE id = _document_id AND deleted_at IS NULL;
  IF _doc.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_doc.tenant_id) THEN RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT public.can_manage_document_shares(_document_id) THEN RAISE EXCEPTION 'DOCUMENT_SHARE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF _principal_type NOT IN ('user','workspace','tenant') THEN RAISE EXCEPTION 'VALIDATION_FAILED: principal_type' USING ERRCODE='22023'; END IF;
  IF _level NOT IN ('view','comment','edit','manage') THEN RAISE EXCEPTION 'VALIDATION_FAILED: level' USING ERRCODE='22023'; END IF;

  IF _principal_type = 'user' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = _doc.tenant_id AND tm.user_id = _principal_id AND tm.status = 'active'
    ) THEN
      RAISE EXCEPTION 'PRINCIPAL_NOT_IN_TENANT' USING ERRCODE='42501';
    END IF;
  ELSIF _principal_type = 'workspace' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = _principal_id AND w.tenant_id = _doc.tenant_id
    ) THEN
      RAISE EXCEPTION 'PRINCIPAL_NOT_IN_TENANT' USING ERRCODE='42501';
    END IF;
  ELSE
    IF _principal_id <> _doc.tenant_id THEN
      RAISE EXCEPTION 'PRINCIPAL_NOT_IN_TENANT' USING ERRCODE='42501';
    END IF;
  END IF;

  INSERT INTO public.document_permissions(document_id, principal_type, principal_id, level, granted_by)
  VALUES (_document_id, _principal_type, _principal_id, _level, _actor)
  ON CONFLICT (document_id, principal_type, principal_id)
    DO UPDATE SET level = EXCLUDED.level, granted_by = _actor, updated_at = now()
  RETURNING * INTO _perm;
  PERFORM public._emit_outbox_event(_doc.tenant_id, 'document.document.shared', 'document', _doc.id::text,
    jsonb_build_object('document_id', _doc.id, 'principal_type', _principal_type, 'principal_id', _principal_id, 'level', _level),
    _idempotency_key, _correlation_id);
  RETURN _perm;
END $function$;

CREATE OR REPLACE FUNCTION public.revoke_document_share(_document_id uuid, _principal_type text, _principal_id uuid, _idempotency_key text DEFAULT NULL::text, _correlation_id text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _actor uuid := auth.uid(); _doc public.documents; _deleted int;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO _doc FROM public.documents WHERE id = _document_id AND deleted_at IS NULL;
  IF _doc.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.can_manage_document_shares(_document_id) THEN RAISE EXCEPTION 'DOCUMENT_SHARE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  DELETE FROM public.document_permissions
   WHERE document_id = _document_id AND principal_type = _principal_type AND principal_id = _principal_id;
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  IF _deleted > 0 THEN
    PERFORM public._emit_outbox_event(_doc.tenant_id, 'document.document.share_revoked', 'document', _doc.id::text,
      jsonb_build_object('document_id', _doc.id, 'principal_type', _principal_type, 'principal_id', _principal_id),
      _idempotency_key, _correlation_id);
  END IF;
  RETURN _deleted > 0;
END $function$;

GRANT EXECUTE ON FUNCTION public.can_manage_document_shares(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_document_share(uuid, text, uuid, text, text) TO authenticated;