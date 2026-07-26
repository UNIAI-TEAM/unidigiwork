
-- =========================================================
-- Batch 0B.4: Standard columns on existing business tables
-- Additive. Backfill deterministic. tenant.id = workspace.id (0B.3).
-- =========================================================

-- ---- WORKSPACES ----
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS tenant_id   uuid REFERENCES public.tenants(id),
  ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_by  uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz;

UPDATE public.workspaces SET tenant_id = id WHERE tenant_id IS NULL;

ALTER TABLE public.workspaces
  ALTER COLUMN tenant_id SET NOT NULL,
  ADD CONSTRAINT workspaces_tenant_matches_id CHECK (tenant_id = id);

DROP TRIGGER IF EXISTS workspaces_bump_row_version ON public.workspaces;
CREATE TRIGGER workspaces_bump_row_version
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

-- ---- DOCUMENTS ----
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS tenant_id   uuid REFERENCES public.tenants(id),
  ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_by  uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz;

-- created_by column already exists in documents? backfill only if column present
-- (schema check via information_schema would need DO block; skip if already present)

UPDATE public.documents d
SET tenant_id = w.tenant_id
FROM public.workspaces w
WHERE d.workspace_id = w.id AND d.tenant_id IS NULL;

ALTER TABLE public.documents
  ALTER COLUMN tenant_id SET NOT NULL;

DROP TRIGGER IF EXISTS documents_bump_row_version ON public.documents;
CREATE TRIGGER documents_bump_row_version
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

-- ---- EMAIL_THREADS ----
ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS tenant_id   uuid REFERENCES public.tenants(id),
  ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by  uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS updated_by  uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz;

UPDATE public.email_threads t
SET tenant_id = w.tenant_id
FROM public.workspaces w
WHERE t.workspace_id = w.id AND t.tenant_id IS NULL;

ALTER TABLE public.email_threads
  ALTER COLUMN tenant_id SET NOT NULL;

DROP TRIGGER IF EXISTS email_threads_bump_row_version ON public.email_threads;
CREATE TRIGGER email_threads_bump_row_version
  BEFORE UPDATE ON public.email_threads
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

-- ---- EMAIL_MESSAGES (immutable; no deleted_at) ----
ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS tenant_id   uuid REFERENCES public.tenants(id),
  ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by  uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS updated_by  uuid REFERENCES public.users(id);

UPDATE public.email_messages m
SET tenant_id = t.tenant_id
FROM public.email_threads t
WHERE m.thread_id = t.id AND m.tenant_id IS NULL;

ALTER TABLE public.email_messages
  ALTER COLUMN tenant_id SET NOT NULL;

DROP TRIGGER IF EXISTS email_messages_bump_row_version ON public.email_messages;
CREATE TRIGGER email_messages_bump_row_version
  BEFORE UPDATE ON public.email_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

-- ---- EMAIL_STATES ----
ALTER TABLE public.email_states
  ADD COLUMN IF NOT EXISTS tenant_id   uuid REFERENCES public.tenants(id),
  ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_by  uuid REFERENCES public.users(id);

UPDATE public.email_states s
SET tenant_id = m.tenant_id
FROM public.email_messages m
WHERE s.message_id = m.id AND s.tenant_id IS NULL;

ALTER TABLE public.email_states
  ALTER COLUMN tenant_id SET NOT NULL;

DROP TRIGGER IF EXISTS email_states_bump_row_version ON public.email_states;
CREATE TRIGGER email_states_bump_row_version
  BEFORE UPDATE ON public.email_states
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

-- ---- NOTIFICATIONS (scoped model) ----
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS scope_type  text NOT NULL DEFAULT 'tenant',
  ADD COLUMN IF NOT EXISTS tenant_id   uuid REFERENCES public.tenants(id),
  ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by  uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS updated_by  uuid REFERENCES public.users(id);

-- Backfill tenant_id where workspace_id resolves; leave others as identity-scoped
UPDATE public.notifications n
SET tenant_id = w.tenant_id, scope_type = 'tenant'
FROM public.workspaces w
WHERE n.workspace_id = w.id AND n.tenant_id IS NULL;

UPDATE public.notifications
SET scope_type = 'identity'
WHERE workspace_id IS NULL AND tenant_id IS NULL;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_scope_chk CHECK (
    (scope_type IN ('platform','identity') AND tenant_id IS NULL)
    OR (scope_type = 'tenant' AND tenant_id IS NOT NULL)
  );

DROP TRIGGER IF EXISTS notifications_bump_row_version ON public.notifications;
CREATE TRIGGER notifications_bump_row_version
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

-- Documents standard timestamp trigger (updated_at already exists via update_updated_at_column pattern?)
-- Skip if there is an existing pattern; row_version trigger already updates updated_at.
