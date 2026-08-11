ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];
CREATE INDEX IF NOT EXISTS tasks_tags_gin_idx ON public.tasks USING GIN (tags);