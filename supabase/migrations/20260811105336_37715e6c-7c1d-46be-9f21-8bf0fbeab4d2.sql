ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS default_member_role text NOT NULL DEFAULT 'member',
  ADD COLUMN IF NOT EXISTS allow_member_invites boolean NOT NULL DEFAULT false;

ALTER TABLE public.workspaces DROP CONSTRAINT IF EXISTS workspaces_visibility_check;
ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_visibility_check CHECK (visibility IN ('private','tenant'));
ALTER TABLE public.workspaces DROP CONSTRAINT IF EXISTS workspaces_default_member_role_check;
ALTER TABLE public.workspaces ADD CONSTRAINT workspaces_default_member_role_check CHECK (default_member_role IN ('member','owner'));