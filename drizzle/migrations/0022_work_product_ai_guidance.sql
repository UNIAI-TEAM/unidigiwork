CREATE TABLE IF NOT EXISTS public.work_product_ai_guidance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_type text NOT NULL,
  guidance text NOT NULL DEFAULT '',
  feedback_fingerprint text NOT NULL DEFAULT '',
  sample_count integer NOT NULL DEFAULT 0,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (tenant_id, business_type)
);

GRANT SELECT ON public.work_product_ai_guidance TO authenticated;
GRANT ALL ON public.work_product_ai_guidance TO service_role;

ALTER TABLE public.work_product_ai_guidance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wpag_select_tenant_member" ON public.work_product_ai_guidance;
CREATE POLICY "wpag_select_tenant_member"
  ON public.work_product_ai_guidance
  FOR SELECT
  TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE OR REPLACE FUNCTION public.upsert_work_product_ai_guidance(
  _tenant_id uuid,
  _business_type text,
  _guidance text,
  _fingerprint text,
  _sample_count integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF NOT public.is_tenant_member(_tenant_id) THEN
    RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.work_product_ai_guidance AS g (
    tenant_id, business_type, guidance, feedback_fingerprint, sample_count,
    created_by, updated_by
  )
  VALUES (
    _tenant_id, _business_type, COALESCE(_guidance, ''), COALESCE(_fingerprint, ''),
    GREATEST(COALESCE(_sample_count, 0), 0), auth.uid(), auth.uid()
  )
  ON CONFLICT (tenant_id, business_type) DO UPDATE
    SET guidance = EXCLUDED.guidance,
        feedback_fingerprint = EXCLUDED.feedback_fingerprint,
        sample_count = EXCLUDED.sample_count,
        row_version = g.row_version + 1,
        updated_at = now(),
        updated_by = auth.uid()
  RETURNING g.id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_work_product_ai_guidance(uuid, text, text, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.upsert_work_product_ai_guidance(uuid, text, text, text, integer) TO authenticated;