-- ============================================================
-- Batch 1D-DB: Business Domain Foundation (ADR-1D-001)
-- ============================================================

-- ---------- ENUM types ----------
CREATE TYPE public.task_status AS ENUM ('todo','in_progress','blocked','done','canceled');
CREATE TYPE public.task_priority AS ENUM ('low','normal','high','urgent');
CREATE TYPE public.meeting_status AS ENUM ('scheduled','live','ended','canceled');
CREATE TYPE public.meeting_rsvp AS ENUM ('pending','accepted','declined','tentative');
CREATE TYPE public.workflow_status AS ENUM ('draft','published','archived');
CREATE TYPE public.workflow_run_status AS ENUM ('pending','running','succeeded','failed','canceled');
CREATE TYPE public.workflow_step_status AS ENUM ('pending','running','succeeded','failed','skipped');

-- ============================================================
-- TASKS domain
-- ============================================================
CREATE TABLE public.tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  parent_task_id  UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  project_id      UUID,
  title           TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  description     TEXT,
  status          public.task_status NOT NULL DEFAULT 'todo',
  priority        public.task_priority NOT NULL DEFAULT 'normal',
  due_at          TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  row_version     BIGINT NOT NULL DEFAULT 1,
  created_by      UUID,
  updated_by      UUID,
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tasks_tenant_select ON public.tasks FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id) AND deleted_at IS NULL);
CREATE POLICY tasks_tenant_write ON public.tasks FOR ALL TO authenticated
  USING (is_tenant_member(tenant_id))
  WITH CHECK (is_tenant_member(tenant_id) AND EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = tasks.workspace_id AND w.tenant_id = tasks.tenant_id
  ));
CREATE INDEX tasks_tenant_workspace_idx ON public.tasks(tenant_id, workspace_id);
CREATE INDEX tasks_tenant_status_idx ON public.tasks(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX tasks_tenant_due_idx ON public.tasks(tenant_id, due_at) WHERE deleted_at IS NULL;
CREATE INDEX tasks_parent_idx ON public.tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_tasks_fill_tenant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL AND NEW.workspace_id IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM public.workspaces WHERE id = NEW.workspace_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'tasks.tenant_id cannot be derived' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tasks_fill_tenant BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_tasks_fill_tenant();
CREATE TRIGGER tasks_bump_row_version BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.task_assignees (
  task_id     UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id),
  role        TEXT NOT NULL DEFAULT 'assignee' CHECK (role IN ('assignee','reviewer','watcher')),
  assigned_by UUID,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_assignees TO authenticated;
GRANT ALL ON public.task_assignees TO service_role;
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_assignees_tenant_all ON public.task_assignees FOR ALL TO authenticated
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
CREATE INDEX task_assignees_user_idx ON public.task_assignees(tenant_id, user_id);

CREATE OR REPLACE FUNCTION public.tg_task_children_fill_tenant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL AND NEW.task_id IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM public.tasks WHERE id = NEW.task_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id cannot be derived from task' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER task_assignees_fill_tenant BEFORE INSERT OR UPDATE ON public.task_assignees
  FOR EACH ROW EXECUTE FUNCTION public.tg_task_children_fill_tenant();

CREATE TABLE public.task_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id),
  author_id   UUID NOT NULL,
  body        TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 10000),
  edited_at   TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ,
  row_version BIGINT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments TO authenticated;
GRANT ALL ON public.task_comments TO service_role;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_comments_tenant_select ON public.task_comments FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id) AND deleted_at IS NULL);
CREATE POLICY task_comments_tenant_write ON public.task_comments FOR ALL TO authenticated
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
CREATE INDEX task_comments_task_idx ON public.task_comments(task_id, created_at DESC);
CREATE TRIGGER task_comments_fill_tenant BEFORE INSERT OR UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.tg_task_children_fill_tenant();
CREATE TRIGGER task_comments_bump BEFORE UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();
CREATE TRIGGER task_comments_updated_at BEFORE UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- DOCUMENTS domain — extend existing table
-- ============================================================
ALTER TABLE public.documents
  ADD COLUMN storage_ref     JSONB,
  ADD COLUMN mime_type       TEXT,
  ADD COLUMN size_bytes      BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),
  ADD COLUMN current_version BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN tags            TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN created_by      UUID;

CREATE INDEX documents_tags_idx ON public.documents USING GIN (tags);

CREATE TABLE public.document_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id),
  version      BIGINT NOT NULL,
  storage_ref  JSONB,
  mime_type    TEXT,
  size_bytes   BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),
  comment      TEXT,
  author_id    UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);
GRANT SELECT, INSERT ON public.document_versions TO authenticated;
GRANT ALL ON public.document_versions TO service_role;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_versions_tenant_select ON public.document_versions FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id));
CREATE POLICY document_versions_tenant_insert ON public.document_versions FOR INSERT TO authenticated
  WITH CHECK (is_tenant_member(tenant_id));
CREATE INDEX document_versions_document_idx ON public.document_versions(document_id, version DESC);

CREATE OR REPLACE FUNCTION public.tg_document_children_fill_tenant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL AND NEW.document_id IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM public.documents WHERE id = NEW.document_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id cannot be derived from document' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER document_versions_fill_tenant BEFORE INSERT OR UPDATE ON public.document_versions
  FOR EACH ROW EXECUTE FUNCTION public.tg_document_children_fill_tenant();

-- Append-only guard
CREATE OR REPLACE FUNCTION public.tg_document_versions_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'document_versions is append-only (op=%)', TG_OP USING ERRCODE = 'restrict_violation';
END $$;
CREATE TRIGGER document_versions_no_update BEFORE UPDATE OR DELETE ON public.document_versions
  FOR EACH ROW EXECUTE FUNCTION public.tg_document_versions_immutable();

CREATE TABLE public.document_permissions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id),
  principal_type TEXT NOT NULL CHECK (principal_type IN ('user','workspace','tenant')),
  principal_id   UUID NOT NULL,
  level          TEXT NOT NULL CHECK (level IN ('view','comment','edit','manage')),
  granted_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, principal_type, principal_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_permissions TO authenticated;
GRANT ALL ON public.document_permissions TO service_role;
ALTER TABLE public.document_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_permissions_tenant_all ON public.document_permissions FOR ALL TO authenticated
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
CREATE INDEX document_permissions_lookup_idx ON public.document_permissions(document_id, principal_type, principal_id);
CREATE TRIGGER document_permissions_fill_tenant BEFORE INSERT OR UPDATE ON public.document_permissions
  FOR EACH ROW EXECUTE FUNCTION public.tg_document_children_fill_tenant();
CREATE TRIGGER document_permissions_updated_at BEFORE UPDATE ON public.document_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- MEETINGS domain
-- ============================================================
CREATE TABLE public.meetings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id),
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title               TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  agenda              TEXT,
  start_at            TIMESTAMPTZ NOT NULL,
  end_at              TIMESTAMPTZ NOT NULL,
  timezone            TEXT NOT NULL DEFAULT 'UTC',
  rrule               TEXT,
  location            TEXT,
  conference_provider TEXT,
  conference_ref      JSONB,
  status              public.meeting_status NOT NULL DEFAULT 'scheduled',
  row_version         BIGINT NOT NULL DEFAULT 1,
  created_by          UUID,
  updated_by          UUID,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT meetings_time_valid CHECK (end_at > start_at)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings TO authenticated;
GRANT ALL ON public.meetings TO service_role;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY meetings_tenant_select ON public.meetings FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id) AND deleted_at IS NULL);
CREATE POLICY meetings_tenant_write ON public.meetings FOR ALL TO authenticated
  USING (is_tenant_member(tenant_id))
  WITH CHECK (is_tenant_member(tenant_id) AND EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = meetings.workspace_id AND w.tenant_id = meetings.tenant_id
  ));
CREATE INDEX meetings_tenant_start_idx ON public.meetings(tenant_id, start_at) WHERE deleted_at IS NULL;
CREATE INDEX meetings_workspace_start_idx ON public.meetings(workspace_id, start_at) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.tg_meetings_fill_tenant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL AND NEW.workspace_id IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM public.workspaces WHERE id = NEW.workspace_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'meetings.tenant_id cannot be derived' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER meetings_fill_tenant BEFORE INSERT OR UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.tg_meetings_fill_tenant();
CREATE TRIGGER meetings_bump BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();
CREATE TRIGGER meetings_updated_at BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.meeting_participants (
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id),
  role       TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('host','moderator','participant','viewer')),
  rsvp       public.meeting_rsvp NOT NULL DEFAULT 'pending',
  rsvp_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (meeting_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_participants TO authenticated;
GRANT ALL ON public.meeting_participants TO service_role;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY meeting_participants_tenant_all ON public.meeting_participants FOR ALL TO authenticated
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
CREATE INDEX meeting_participants_user_idx ON public.meeting_participants(tenant_id, user_id);

CREATE OR REPLACE FUNCTION public.tg_meeting_participants_fill_tenant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL AND NEW.meeting_id IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM public.meetings WHERE id = NEW.meeting_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id cannot be derived from meeting' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER meeting_participants_fill_tenant BEFORE INSERT OR UPDATE ON public.meeting_participants
  FOR EACH ROW EXECUTE FUNCTION public.tg_meeting_participants_fill_tenant();
CREATE TRIGGER meeting_participants_updated_at BEFORE UPDATE ON public.meeting_participants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- WORKFLOW domain
-- ============================================================
CREATE TABLE public.workflows (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  description  TEXT,
  definition   JSONB NOT NULL DEFAULT '{}'::jsonb,
  version      INTEGER NOT NULL DEFAULT 1,
  status       public.workflow_status NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  row_version  BIGINT NOT NULL DEFAULT 1,
  created_by   UUID,
  updated_by   UUID,
  deleted_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflows TO authenticated;
GRANT ALL ON public.workflows TO service_role;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY workflows_tenant_select ON public.workflows FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id) AND deleted_at IS NULL);
CREATE POLICY workflows_tenant_write ON public.workflows FOR ALL TO authenticated
  USING (is_tenant_member(tenant_id))
  WITH CHECK (is_tenant_member(tenant_id) AND EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = workflows.workspace_id AND w.tenant_id = workflows.tenant_id
  ));
CREATE INDEX workflows_tenant_workspace_idx ON public.workflows(tenant_id, workspace_id);
CREATE INDEX workflows_tenant_status_idx ON public.workflows(tenant_id, status) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.tg_workflows_fill_tenant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL AND NEW.workspace_id IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM public.workspaces WHERE id = NEW.workspace_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'workflows.tenant_id cannot be derived' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workflows_fill_tenant BEFORE INSERT OR UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.tg_workflows_fill_tenant();
CREATE TRIGGER workflows_bump BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();
CREATE TRIGGER workflows_updated_at BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.workflow_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id      UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id),
  workflow_version INTEGER NOT NULL,
  status           public.workflow_run_status NOT NULL DEFAULT 'pending',
  context          JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at       TIMESTAMPTZ,
  ended_at         TIMESTAMPTZ,
  correlation_id   TEXT,
  triggered_by     UUID,
  row_version      BIGINT NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_runs TO authenticated;
GRANT ALL ON public.workflow_runs TO service_role;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY workflow_runs_tenant_all ON public.workflow_runs FOR ALL TO authenticated
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
CREATE INDEX workflow_runs_workflow_idx ON public.workflow_runs(workflow_id, started_at DESC);
CREATE INDEX workflow_runs_tenant_status_idx ON public.workflow_runs(tenant_id, status);

CREATE OR REPLACE FUNCTION public.tg_workflow_runs_fill_tenant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL AND NEW.workflow_id IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM public.workflows WHERE id = NEW.workflow_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id cannot be derived from workflow' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workflow_runs_fill_tenant BEFORE INSERT OR UPDATE ON public.workflow_runs
  FOR EACH ROW EXECUTE FUNCTION public.tg_workflow_runs_fill_tenant();
CREATE TRIGGER workflow_runs_bump BEFORE UPDATE ON public.workflow_runs
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();
CREATE TRIGGER workflow_runs_updated_at BEFORE UPDATE ON public.workflow_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.workflow_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id),
  step_key    TEXT NOT NULL,
  status      public.workflow_step_status NOT NULL DEFAULT 'pending',
  input       JSONB NOT NULL DEFAULT '{}'::jsonb,
  output      JSONB,
  error       TEXT,
  started_at  TIMESTAMPTZ,
  ended_at    TIMESTAMPTZ,
  row_version BIGINT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, step_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_steps TO authenticated;
GRANT ALL ON public.workflow_steps TO service_role;
ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY workflow_steps_tenant_all ON public.workflow_steps FOR ALL TO authenticated
  USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
CREATE INDEX workflow_steps_run_idx ON public.workflow_steps(run_id, started_at);

CREATE OR REPLACE FUNCTION public.tg_workflow_steps_fill_tenant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL AND NEW.run_id IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM public.workflow_runs WHERE id = NEW.run_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id cannot be derived from workflow_run' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER workflow_steps_fill_tenant BEFORE INSERT OR UPDATE ON public.workflow_steps
  FOR EACH ROW EXECUTE FUNCTION public.tg_workflow_steps_fill_tenant();
CREATE TRIGGER workflow_steps_bump BEFORE UPDATE ON public.workflow_steps
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();
CREATE TRIGGER workflow_steps_updated_at BEFORE UPDATE ON public.workflow_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Quota meter seed (ADR §2.7)
-- ============================================================
INSERT INTO public.features(key, name, kind, unit, category, sort_order) VALUES
  ('tasks.active',                 'Active tasks',              'quota', 'count', 'tasks',     100),
  ('documents.storage_bytes',      'Document storage',          'quota', 'bytes', 'documents', 101),
  ('meetings.scheduled_per_month', 'Meetings scheduled/month',  'quota', 'count', 'meetings',  102),
  ('workflows.runs_per_month',     'Workflow runs/month',       'quota', 'count', 'workflows', 103)
ON CONFLICT (key) DO NOTHING;
