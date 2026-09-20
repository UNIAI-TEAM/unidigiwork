ALTER TABLE public.ceo_kpi_settings
  ADD COLUMN IF NOT EXISTS auto_retrain BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_retrain_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_retrain_signature TEXT;