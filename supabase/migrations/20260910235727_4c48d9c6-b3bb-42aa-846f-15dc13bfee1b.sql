ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS progress_pct smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS start_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_at timestamptz;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_progress_pct_range;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_progress_pct_range CHECK (progress_pct >= 0 AND progress_pct <= 100);

CREATE INDEX IF NOT EXISTS tasks_start_at_idx ON public.tasks (tenant_id, start_at);
CREATE INDEX IF NOT EXISTS tasks_end_at_idx ON public.tasks (tenant_id, end_at);