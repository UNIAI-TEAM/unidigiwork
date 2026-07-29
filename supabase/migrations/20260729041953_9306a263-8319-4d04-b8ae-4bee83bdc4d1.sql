
CREATE TABLE IF NOT EXISTS public.quota_export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NULL,
  meter_key TEXT NULL,
  status_filter TEXT NOT NULL DEFAULT 'all' CHECK (status_filter IN ('all','pass','fail')),
  from_ts TIMESTAMPTZ NOT NULL,
  to_ts TIMESTAMPTZ NOT NULL,
  max_rows INTEGER NOT NULL DEFAULT 500000 CHECK (max_rows BETWEEN 1 AND 2000000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','succeeded','failed','canceled')),
  row_count INTEGER NULL,
  file_path TEXT NULL,
  file_size_bytes BIGINT NULL,
  truncated BOOLEAN NOT NULL DEFAULT false,
  error TEXT NULL,
  correlation_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_quota_export_jobs_status_created
  ON public.quota_export_jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quota_export_jobs_requester
  ON public.quota_export_jobs (requested_by, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quota_export_jobs TO authenticated;
GRANT ALL ON public.quota_export_jobs TO service_role;

ALTER TABLE public.quota_export_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read quota export jobs" ON public.quota_export_jobs;
CREATE POLICY "admins read quota export jobs"
  ON public.quota_export_jobs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins insert quota export jobs" ON public.quota_export_jobs;
CREATE POLICY "admins insert quota export jobs"
  ON public.quota_export_jobs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND requested_by = auth.uid());

DROP POLICY IF EXISTS "admins delete quota export jobs" ON public.quota_export_jobs;
CREATE POLICY "admins delete quota export jobs"
  ON public.quota_export_jobs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Storage: admins can read objects in quota-exports (writes go through service role)
DROP POLICY IF EXISTS "admins read quota-exports" ON storage.objects;
CREATE POLICY "admins read quota-exports"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'quota-exports' AND public.has_role(auth.uid(), 'admin'));
