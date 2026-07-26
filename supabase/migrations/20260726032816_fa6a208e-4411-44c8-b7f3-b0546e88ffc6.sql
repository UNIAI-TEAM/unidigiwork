
-- =========================================================
-- Batch 0B.7: Indexes + composite unique keys
-- =========================================================

-- Composite unique on parent tables (targets for later composite FKs)
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_tenant_id_uniq
  ON public.workspaces(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS email_threads_tenant_id_uniq
  ON public.email_threads(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS email_messages_tenant_id_uniq
  ON public.email_messages(tenant_id, id);

-- Tenant-aware access patterns
CREATE INDEX IF NOT EXISTS workspaces_tenant_idx ON public.workspaces(tenant_id);

CREATE INDEX IF NOT EXISTS documents_tenant_workspace_idx
  ON public.documents(tenant_id, workspace_id);
CREATE INDEX IF NOT EXISTS documents_tenant_updated_idx
  ON public.documents(tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS email_threads_tenant_ws_last_idx
  ON public.email_threads(tenant_id, workspace_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS email_messages_tenant_thread_sent_idx
  ON public.email_messages(tenant_id, thread_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS email_states_tenant_user_folder_idx
  ON public.email_states(tenant_id, user_id, folder);

CREATE INDEX IF NOT EXISTS notifications_tenant_user_created_idx
  ON public.notifications(tenant_id, user_id, created_at DESC)
  WHERE tenant_id IS NOT NULL;

-- Workspace membership hygiene
ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
