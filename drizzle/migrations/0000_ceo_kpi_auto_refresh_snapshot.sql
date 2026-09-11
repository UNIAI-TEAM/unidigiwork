ALTER TABLE public.ceo_kpi_settings
  ADD COLUMN IF NOT EXISTS kpi_refreshed_at timestamptz,
  ADD COLUMN IF NOT EXISTS kpi_snapshot jsonb;