ALTER TABLE public.work_product_artifacts DROP CONSTRAINT IF EXISTS work_product_artifacts_role_check;
ALTER TABLE public.work_product_artifacts ADD CONSTRAINT work_product_artifacts_role_check
  CHECK (role = ANY (ARRAY['SOURCE'::text, 'EXPORT'::text, 'PREVIEW'::text, 'BENCHMARK'::text]));
ALTER TABLE public.work_product_artifacts ADD COLUMN IF NOT EXISTS engine text;

CREATE TABLE IF NOT EXISTS public.work_product_engine_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  work_product_id uuid NOT NULL REFERENCES public.work_products(id) ON DELETE CASCADE,
  version integer NOT NULL,
  format text NOT NULL CHECK (format = ANY (ARRAY['DOCX','XLSX','PPTX','PDF'])),
  mode text NOT NULL DEFAULT 'GENERATE' CHECK (mode = ANY (ARRAY['GENERATE','ROUND_TRIP'])),
  builtin_artifact_id uuid REFERENCES public.work_product_artifacts(id) ON DELETE SET NULL,
  genoffice_artifact_id uuid REFERENCES public.work_product_artifacts(id) ON DELETE SET NULL,
  genoffice_commit_sha text,
  genoffice_engine_version text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status = ANY (ARRAY['PENDING','RUNNING','PASSED','FAILED','PARTIAL'])),
  failure_reason text,
  comparison_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_product_engine_benchmarks_product_idx
  ON public.work_product_engine_benchmarks (work_product_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_product_engine_benchmarks TO authenticated;
GRANT ALL ON public.work_product_engine_benchmarks TO service_role;

ALTER TABLE public.work_product_engine_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "benchmarks_select_visible" ON public.work_product_engine_benchmarks
  FOR SELECT TO authenticated
  USING (public.can_view_work_product(work_product_id));

CREATE POLICY "benchmarks_insert_editor" ON public.work_product_engine_benchmarks
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_work_product(work_product_id));

CREATE POLICY "benchmarks_update_editor" ON public.work_product_engine_benchmarks
  FOR UPDATE TO authenticated
  USING (public.can_edit_work_product(work_product_id))
  WITH CHECK (public.can_edit_work_product(work_product_id));

CREATE POLICY "benchmarks_delete_editor" ON public.work_product_engine_benchmarks
  FOR DELETE TO authenticated
  USING (public.can_edit_work_product(work_product_id));

CREATE TRIGGER work_product_engine_benchmarks_updated_at
  BEFORE UPDATE ON public.work_product_engine_benchmarks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();