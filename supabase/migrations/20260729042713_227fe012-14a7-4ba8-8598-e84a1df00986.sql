ALTER TABLE public.quota_export_jobs
  ADD COLUMN IF NOT EXISTS columns text[];