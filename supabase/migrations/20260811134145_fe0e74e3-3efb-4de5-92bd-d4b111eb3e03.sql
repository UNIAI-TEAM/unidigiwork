ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS default_task_priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS default_task_due_days integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS default_task_title_prefix text NOT NULL DEFAULT '';