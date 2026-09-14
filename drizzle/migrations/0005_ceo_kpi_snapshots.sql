CREATE TABLE public.ceo_kpi_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  captured_at timestamptz NOT NULL DEFAULT now(),
  score numeric,
  configured boolean NOT NULL DEFAULT false,
  total_tasks integer NOT NULL DEFAULT 0,
  completed integer NOT NULL DEFAULT 0,
  overdue integer NOT NULL DEFAULT 0,
  ai_share_pct numeric,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.ceo_kpi_snapshots TO authenticated;
GRANT ALL ON public.ceo_kpi_snapshots TO service_role;

ALTER TABLE public.ceo_kpi_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY ceo_kpi_snapshots_select_members ON public.ceo_kpi_snapshots
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tenant_members m
  WHERE m.tenant_id = ceo_kpi_snapshots.tenant_id
    AND m.user_id = auth.uid()
    AND m.status = 'active'::tenant_member_status
));

CREATE INDEX ceo_kpi_snapshots_tenant_time_idx
  ON public.ceo_kpi_snapshots (tenant_id, captured_at DESC);