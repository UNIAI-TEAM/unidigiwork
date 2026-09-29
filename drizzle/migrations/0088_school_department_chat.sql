ALTER TABLE public.chat_channels ADD COLUMN IF NOT EXISTS school_department_id uuid REFERENCES public.school_departments(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS chat_channels_school_dept_uq ON public.chat_channels(school_department_id) WHERE school_department_id IS NOT NULL AND deleted_at IS NULL;

-- Ensure a private chat channel exists for a department; returns channel id
CREATE OR REPLACE FUNCTION public._school_ensure_dept_chat(_dept_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; ws uuid; ch uuid;
BEGIN
  SELECT * INTO d FROM public.school_departments WHERE id = _dept_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT id INTO ch FROM public.chat_channels WHERE school_department_id = _dept_id AND deleted_at IS NULL;
  IF ch IS NOT NULL THEN
    UPDATE public.chat_channels SET name = d.name, updated_at = now() WHERE id = ch AND name <> d.name;
  ELSE
    SELECT id INTO ws FROM public.workspaces WHERE tenant_id = d.tenant_id ORDER BY created_at LIMIT 1;
    IF ws IS NULL THEN RETURN NULL; END IF;
    INSERT INTO public.chat_channels (tenant_id, workspace_id, name, description, kind, is_private, created_by, updated_by, school_department_id)
    VALUES (d.tenant_id, ws, d.name, 'Nhóm trao đổi bài tập và kế hoạch của ' || d.name, 'channel', true, d.created_by, d.created_by, _dept_id)
    RETURNING id INTO ch;
  END IF;
  -- sync members: active tenant members whose department matches
  INSERT INTO public.chat_members (channel_id, user_id, tenant_id, role)
  SELECT ch, p.user_id, d.tenant_id, 'member'
  FROM public.tenant_member_profiles p
  JOIN public.tenant_members tm ON tm.tenant_id = p.tenant_id AND tm.user_id = p.user_id AND tm.status = 'active'
  WHERE p.tenant_id = d.tenant_id AND p.department = d.name
  ON CONFLICT DO NOTHING;
  DELETE FROM public.chat_members cm
  WHERE cm.channel_id = ch AND NOT EXISTS (
    SELECT 1 FROM public.tenant_member_profiles p
    JOIN public.tenant_members tm ON tm.tenant_id = p.tenant_id AND tm.user_id = p.user_id AND tm.status = 'active'
    WHERE p.tenant_id = d.tenant_id AND p.user_id = cm.user_id AND p.department = d.name);
  RETURN ch;
END $$;
REVOKE ALL ON FUNCTION public._school_ensure_dept_chat(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._school_dept_chat_on_dept()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public._school_ensure_dept_chat(NEW.id); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_school_dept_chat ON public.school_departments;
CREATE TRIGGER trg_school_dept_chat AFTER INSERT OR UPDATE OF name ON public.school_departments
FOR EACH ROW EXECUTE FUNCTION public._school_dept_chat_on_dept();

CREATE OR REPLACE FUNCTION public._school_dept_chat_on_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; tid uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
BEGIN
  FOR r IN SELECT id FROM public.school_departments WHERE tenant_id = tid LOOP
    PERFORM public._school_ensure_dept_chat(r.id);
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_school_dept_chat_profile ON public.tenant_member_profiles;
CREATE TRIGGER trg_school_dept_chat_profile AFTER INSERT OR UPDATE OF department OR DELETE ON public.tenant_member_profiles
FOR EACH ROW EXECUTE FUNCTION public._school_dept_chat_on_member();
DROP TRIGGER IF EXISTS trg_school_dept_chat_member ON public.tenant_members;
CREATE TRIGGER trg_school_dept_chat_member AFTER INSERT OR UPDATE OF status ON public.tenant_members
FOR EACH ROW EXECUTE FUNCTION public._school_dept_chat_on_member();

-- backfill
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id FROM public.school_departments LOOP PERFORM public._school_ensure_dept_chat(r.id); END LOOP;
END $$;