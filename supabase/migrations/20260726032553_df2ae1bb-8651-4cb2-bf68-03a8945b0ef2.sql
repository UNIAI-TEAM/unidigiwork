
-- =========================================================
-- Batch 0B.4b: Compatibility triggers auto-fill tenant_id
-- Deterministic. To be removed after 0C trusted commands adopt.
-- =========================================================

-- Documents
CREATE OR REPLACE FUNCTION public.tg_documents_fill_tenant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL AND NEW.workspace_id IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM public.workspaces WHERE id = NEW.workspace_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'documents.tenant_id cannot be derived (workspace_id=%)', NEW.workspace_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS documents_fill_tenant ON public.documents;
CREATE TRIGGER documents_fill_tenant
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_documents_fill_tenant();

-- Email threads
CREATE OR REPLACE FUNCTION public.tg_email_threads_fill_tenant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL AND NEW.workspace_id IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM public.workspaces WHERE id = NEW.workspace_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'email_threads.tenant_id cannot be derived' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS email_threads_fill_tenant ON public.email_threads;
CREATE TRIGGER email_threads_fill_tenant
  BEFORE INSERT OR UPDATE ON public.email_threads
  FOR EACH ROW EXECUTE FUNCTION public.tg_email_threads_fill_tenant();

-- Email messages
CREATE OR REPLACE FUNCTION public.tg_email_messages_fill_tenant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL AND NEW.thread_id IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM public.email_threads WHERE id = NEW.thread_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'email_messages.tenant_id cannot be derived' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS email_messages_fill_tenant ON public.email_messages;
CREATE TRIGGER email_messages_fill_tenant
  BEFORE INSERT OR UPDATE ON public.email_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_email_messages_fill_tenant();

-- Email states
CREATE OR REPLACE FUNCTION public.tg_email_states_fill_tenant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL AND NEW.message_id IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM public.email_messages WHERE id = NEW.message_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'email_states.tenant_id cannot be derived' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS email_states_fill_tenant ON public.email_states;
CREATE TRIGGER email_states_fill_tenant
  BEFORE INSERT OR UPDATE ON public.email_states
  FOR EACH ROW EXECUTE FUNCTION public.tg_email_states_fill_tenant();

-- Notifications: derive tenant_id when workspace_id present
CREATE OR REPLACE FUNCTION public.tg_notifications_fill_tenant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL AND NEW.workspace_id IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM public.workspaces WHERE id = NEW.workspace_id;
    IF NEW.tenant_id IS NOT NULL THEN
      NEW.scope_type := 'tenant';
    END IF;
  END IF;
  IF NEW.tenant_id IS NULL AND NEW.scope_type = 'tenant' THEN
    NEW.scope_type := 'identity';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notifications_fill_tenant ON public.notifications;
CREATE TRIGGER notifications_fill_tenant
  BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.tg_notifications_fill_tenant();

-- Workspaces already have tenant_id = id via CHECK; add trigger to auto-fill on insert
CREATE OR REPLACE FUNCTION public.tg_workspaces_fill_tenant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN NEW.tenant_id := NEW.id; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS workspaces_fill_tenant ON public.workspaces;
CREATE TRIGGER workspaces_fill_tenant
  BEFORE INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.tg_workspaces_fill_tenant();

-- Also auto-create a tenant + owner membership when a workspace is created
CREATE OR REPLACE FUNCTION public.handle_new_workspace_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.tenants (id, slug, name, status, created_by, updated_by)
  VALUES (
    NEW.id,
    regexp_replace(lower(NEW.name), '[^a-z0-9]+', '-', 'g') || '-' || substr(NEW.id::text, 1, 8),
    NEW.name,
    'active',
    NEW.owner_id,
    NEW.owner_id
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.tenant_members (tenant_id, user_id, role, status, created_by, updated_by)
  VALUES (NEW.id, NEW.owner_id, 'tenant_owner', 'active', NEW.owner_id, NEW.owner_id)
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_workspace_created_tenant ON public.workspaces;
CREATE TRIGGER on_workspace_created_tenant
  AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_workspace_tenant();
