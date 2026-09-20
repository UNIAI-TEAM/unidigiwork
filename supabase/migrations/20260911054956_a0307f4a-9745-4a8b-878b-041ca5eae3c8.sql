CREATE TABLE public.ceo_kpi_settings (
  tenant_id UUID PRIMARY KEY,
  targets JSONB NOT NULL DEFAULT '{}'::jsonb,
  department_weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ceo_kpi_settings TO authenticated;
GRANT ALL ON public.ceo_kpi_settings TO service_role;

ALTER TABLE public.ceo_kpi_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ceo_kpi_settings_select_members" ON public.ceo_kpi_settings
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tenant_members m
  WHERE m.tenant_id = ceo_kpi_settings.tenant_id
    AND m.user_id = auth.uid()
    AND m.status = 'active'
));

CREATE POLICY "ceo_kpi_settings_write_admins" ON public.ceo_kpi_settings
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tenant_members m
  WHERE m.tenant_id = ceo_kpi_settings.tenant_id
    AND m.user_id = auth.uid()
    AND m.status = 'active'
    AND m.role IN ('tenant_owner','tenant_admin')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.tenant_members m
  WHERE m.tenant_id = ceo_kpi_settings.tenant_id
    AND m.user_id = auth.uid()
    AND m.status = 'active'
    AND m.role IN ('tenant_owner','tenant_admin')
));