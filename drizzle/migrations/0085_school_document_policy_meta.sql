CREATE TABLE public.document_policy_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  doc_number text,
  issuer text,
  issued_at date,
  effective_from date,
  effective_to date,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('draft','approved','effective','expired','withdrawn','superseded','unknown')),
  department text,
  last_verified_at timestamptz,
  row_version bigint NOT NULL DEFAULT 1,
  created_by uuid, updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id)
);
CREATE INDEX document_policy_meta_tenant_idx ON public.document_policy_meta(tenant_id);
GRANT SELECT ON public.document_policy_meta TO authenticated;
GRANT ALL ON public.document_policy_meta TO service_role;
ALTER TABLE public.document_policy_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "policy meta readable with document" ON public.document_policy_meta FOR SELECT TO authenticated
  USING (public.can_access_document(document_id));

CREATE OR REPLACE FUNCTION public.save_document_policy_meta(
  _document_id uuid, _doc_number text, _issuer text, _issued_at date, _effective_from date, _effective_to date,
  _status text, _department text, _idempotency_key text, _correlation_id text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _tid uuid; _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT tenant_id INTO _tid FROM public.documents WHERE id=_document_id AND deleted_at IS NULL;
  IF _tid IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='02000'; END IF;
  IF NOT public._school_is_bgh(_tid,_uid) THEN RAISE EXCEPTION 'POLICY_META_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF _status NOT IN ('draft','approved','effective','expired','withdrawn','superseded','unknown') THEN RAISE EXCEPTION 'INVALID_STATUS' USING ERRCODE='22023'; END IF;
  IF _effective_from IS NOT NULL AND _effective_to IS NOT NULL AND _effective_to < _effective_from THEN RAISE EXCEPTION 'INVALID_EFFECTIVE_RANGE' USING ERRCODE='22023'; END IF;
  INSERT INTO public.document_policy_meta(tenant_id,document_id,doc_number,issuer,issued_at,effective_from,effective_to,status,department,last_verified_at,created_by,updated_by)
  VALUES (_tid,_document_id,nullif(left(_doc_number,100),''),nullif(left(_issuer,200),''),_issued_at,_effective_from,_effective_to,_status,nullif(left(_department,120),''),now(),_uid,_uid)
  ON CONFLICT (document_id) DO UPDATE SET doc_number=EXCLUDED.doc_number, issuer=EXCLUDED.issuer, issued_at=EXCLUDED.issued_at,
    effective_from=EXCLUDED.effective_from, effective_to=EXCLUDED.effective_to, status=EXCLUDED.status, department=EXCLUDED.department,
    last_verified_at=now(), updated_by=_uid, updated_at=now(), row_version=document_policy_meta.row_version+1
  RETURNING id INTO _id;
  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (_tid,_uid,'document.policy_meta_saved','document',_document_id::text, jsonb_build_object('status',_status,'department',_department), _correlation_id);
  PERFORM public._emit_outbox_event(_tid,'document.policy_meta_saved.v1','document',_document_id::text, jsonb_build_object('document_id',_document_id), _idempotency_key, _correlation_id);
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.save_document_policy_meta(uuid,text,text,date,date,date,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_document_policy_meta(uuid,text,text,date,date,date,text,text,text,text) TO authenticated;