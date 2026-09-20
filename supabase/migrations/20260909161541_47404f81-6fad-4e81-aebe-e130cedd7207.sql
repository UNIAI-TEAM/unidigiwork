CREATE TABLE public.work_graph_public_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Bản đồ công việc',
  token_hash text NOT NULL UNIQUE,
  include_documents boolean NOT NULL DEFAULT true,
  include_tasks boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  last_viewed_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX work_graph_public_shares_tenant_idx ON public.work_graph_public_shares (tenant_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_graph_public_shares TO authenticated;
GRANT ALL ON public.work_graph_public_shares TO service_role;

ALTER TABLE public.work_graph_public_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wgps_admin_manage" ON public.work_graph_public_shares
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_members m
    WHERE m.tenant_id = work_graph_public_shares.tenant_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role IN ('tenant_owner','tenant_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tenant_members m
    WHERE m.tenant_id = work_graph_public_shares.tenant_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role IN ('tenant_owner','tenant_admin')
  ));

CREATE TRIGGER work_graph_public_shares_updated_at
  BEFORE UPDATE ON public.work_graph_public_shares
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();