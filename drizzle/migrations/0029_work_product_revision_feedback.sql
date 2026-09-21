CREATE TABLE public.work_product_revision_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  work_product_id uuid NOT NULL REFERENCES public.work_products(id) ON DELETE CASCADE,
  before_version integer NOT NULL,
  after_version integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('COMMENT','REVIEW')),
  feedback_status text,
  feedback_at timestamptz,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX work_product_revision_feedback_wp_idx
  ON public.work_product_revision_feedback (work_product_id, after_version DESC);

GRANT SELECT, INSERT ON public.work_product_revision_feedback TO authenticated;
GRANT ALL ON public.work_product_revision_feedback TO service_role;

ALTER TABLE public.work_product_revision_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_product_revision_feedback_select
  ON public.work_product_revision_feedback
  FOR SELECT TO authenticated
  USING (public.can_view_work_product(work_product_id));

CREATE POLICY work_product_revision_feedback_insert
  ON public.work_product_revision_feedback
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_work_product(work_product_id) AND created_by = auth.uid());