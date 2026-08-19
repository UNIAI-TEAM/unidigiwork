CREATE TABLE IF NOT EXISTS public.document_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  document_title text,
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('view','download','print','export','share_view')),
  version bigint,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_access_logs_doc_idx ON public.document_access_logs (document_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS document_access_logs_tenant_idx ON public.document_access_logs (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS document_access_logs_actor_idx ON public.document_access_logs (actor_id, occurred_at DESC);

GRANT SELECT ON public.document_access_logs TO authenticated;
GRANT ALL ON public.document_access_logs TO service_role;

ALTER TABLE public.document_access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_access_logs_select ON public.document_access_logs
  FOR SELECT TO authenticated
  USING (
    public.is_tenant_member(tenant_id)
    AND (
      actor_id = auth.uid()
      OR public.can_manage_document_shares(document_id)
      OR public.has_role(auth.uid(), 'admin')
    )
  );

CREATE OR REPLACE FUNCTION public.log_document_access(_document_id uuid, _action text, _context jsonb DEFAULT '{}'::jsonb)
RETURNS public.document_access_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _actor uuid := auth.uid(); _doc public.documents; _row public.document_access_logs;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF _action NOT IN ('view','download','print','export','share_view') THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: action' USING ERRCODE='22023';
  END IF;
  SELECT * INTO _doc FROM public.documents WHERE id = _document_id AND deleted_at IS NULL;
  IF _doc.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.can_access_document(_document_id) THEN
    RAISE EXCEPTION 'DOCUMENT_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.document_access_logs(
    tenant_id, workspace_id, document_id, document_title, actor_id, action, version, context)
  VALUES (_doc.tenant_id, _doc.workspace_id, _document_id, _doc.title, _actor, _action,
          _doc.current_version, COALESCE(_context, '{}'::jsonb))
  RETURNING * INTO _row;
  RETURN _row;
END $$;

REVOKE ALL ON FUNCTION public.log_document_access(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_document_access(uuid, text, jsonb) TO authenticated;