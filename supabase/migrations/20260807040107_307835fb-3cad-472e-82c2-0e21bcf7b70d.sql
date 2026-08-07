ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh';

ALTER TABLE public.workspaces
  DROP CONSTRAINT IF EXISTS workspaces_timezone_valid;

ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_timezone_valid CHECK (length(btrim(timezone)) > 0);