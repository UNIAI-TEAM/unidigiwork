ALTER TABLE public.quota_export_jobs
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'csv'
    CHECK (format IN ('csv','xlsx'));