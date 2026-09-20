ALTER TABLE public.work_product_artifacts DROP CONSTRAINT work_product_artifacts_role_check;
ALTER TABLE public.work_product_artifacts ADD CONSTRAINT work_product_artifacts_role_check
  CHECK (role = ANY (ARRAY['SOURCE','EXPORT','PREVIEW','BENCHMARK','SOURCE_ORIGINAL','SOURCE_VERSION']));
ALTER TABLE public.work_product_artifacts ADD COLUMN IF NOT EXISTS sha256 text;
ALTER TABLE public.work_product_artifacts ADD COLUMN IF NOT EXISTS immutable boolean NOT NULL DEFAULT false;

ALTER TABLE public.work_products ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'NATIVE';
ALTER TABLE public.work_products ADD CONSTRAINT work_products_origin_check CHECK (origin = ANY (ARRAY['NATIVE','IMPORTED_DOCX']));
ALTER TABLE public.work_products ADD COLUMN IF NOT EXISTS source_artifact_id uuid REFERENCES public.work_product_artifacts(id) ON DELETE SET NULL;
ALTER TABLE public.work_products ADD COLUMN IF NOT EXISTS source_sha256 text;
ALTER TABLE public.work_products ADD COLUMN IF NOT EXISTS source_filename text;
ALTER TABLE public.work_products ADD COLUMN IF NOT EXISTS source_mime_type text;
ALTER TABLE public.work_products ADD COLUMN IF NOT EXISTS source_engine text;
ALTER TABLE public.work_products ADD COLUMN IF NOT EXISTS source_imported_at timestamptz;

CREATE TABLE public.work_product_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  work_product_id uuid NOT NULL REFERENCES public.work_products(id) ON DELETE CASCADE,
  source_artifact_id uuid REFERENCES public.work_product_artifacts(id) ON DELETE SET NULL,
  source_version integer NOT NULL DEFAULT 1,
  block_key text NOT NULL,
  ordinal integer NOT NULL,
  block_type text NOT NULL,
  text text NOT NULL DEFAULT '',
  source_anchor jsonb NOT NULL DEFAULT '{}'::jsonb,
  editability text NOT NULL DEFAULT 'EDITABLE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_product_blocks_editability_check CHECK (editability = ANY (ARRAY['EDITABLE','READ_ONLY_PRESERVED'])),
  CONSTRAINT work_product_blocks_unique UNIQUE (work_product_id, source_version, block_key)
);
CREATE INDEX work_product_blocks_wp_idx ON public.work_product_blocks (work_product_id, source_version, ordinal);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_product_blocks TO authenticated;
GRANT ALL ON public.work_product_blocks TO service_role;
ALTER TABLE public.work_product_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY wp_blocks_select ON public.work_product_blocks FOR SELECT TO authenticated
  USING (public.can_view_work_product(work_product_id));
CREATE POLICY wp_blocks_write ON public.work_product_blocks FOR ALL TO authenticated
  USING (public.can_edit_work_product(work_product_id))
  WITH CHECK (public.can_edit_work_product(work_product_id));

CREATE TABLE public.work_product_ai_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  work_product_id uuid NOT NULL REFERENCES public.work_products(id) ON DELETE CASCADE,
  base_version integer NOT NULL,
  instruction text NOT NULL,
  model text,
  agent_id text,
  context_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'PENDING',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wp_ai_proposals_status_check CHECK (status = ANY (ARRAY['PENDING','APPLIED','REJECTED','SUPERSEDED']))
);
CREATE INDEX wp_ai_proposals_wp_idx ON public.work_product_ai_proposals (work_product_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_product_ai_proposals TO authenticated;
GRANT ALL ON public.work_product_ai_proposals TO service_role;
ALTER TABLE public.work_product_ai_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY wp_ai_proposals_select ON public.work_product_ai_proposals FOR SELECT TO authenticated
  USING (public.can_view_work_product(work_product_id));
CREATE POLICY wp_ai_proposals_write ON public.work_product_ai_proposals FOR ALL TO authenticated
  USING (public.can_edit_work_product(work_product_id))
  WITH CHECK (public.can_edit_work_product(work_product_id));

CREATE TABLE public.work_product_change_ops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  work_product_id uuid NOT NULL REFERENCES public.work_products(id) ON DELETE CASCADE,
  proposal_id uuid REFERENCES public.work_product_ai_proposals(id) ON DELETE SET NULL,
  block_id uuid REFERENCES public.work_product_blocks(id) ON DELETE CASCADE,
  block_key text NOT NULL,
  source_anchor jsonb NOT NULL DEFAULT '{}'::jsonb,
  before_text text NOT NULL DEFAULT '',
  after_text text NOT NULL DEFAULT '',
  origin text NOT NULL DEFAULT 'HUMAN',
  status text NOT NULL DEFAULT 'PENDING',
  base_version integer NOT NULL,
  applied_version integer,
  author_id uuid,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wp_change_ops_origin_check CHECK (origin = ANY (ARRAY['HUMAN','AI'])),
  CONSTRAINT wp_change_ops_status_check CHECK (status = ANY (ARRAY['PENDING','ACCEPTED','REJECTED','APPLIED']))
);
CREATE INDEX wp_change_ops_wp_idx ON public.work_product_change_ops (work_product_id, status, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_product_change_ops TO authenticated;
GRANT ALL ON public.work_product_change_ops TO service_role;
ALTER TABLE public.work_product_change_ops ENABLE ROW LEVEL SECURITY;
CREATE POLICY wp_change_ops_select ON public.work_product_change_ops FOR SELECT TO authenticated
  USING (public.can_view_work_product(work_product_id));
CREATE POLICY wp_change_ops_write ON public.work_product_change_ops FOR ALL TO authenticated
  USING (public.can_edit_work_product(work_product_id))
  WITH CHECK (public.can_edit_work_product(work_product_id));

CREATE TRIGGER wp_blocks_updated_at BEFORE UPDATE ON public.work_product_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER wp_ai_proposals_updated_at BEFORE UPDATE ON public.work_product_ai_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER wp_change_ops_updated_at BEFORE UPDATE ON public.work_product_change_ops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();