
-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- workspaces
CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- workspace_members
CREATE TABLE public.workspace_members (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT ALL ON public.workspace_members TO service_role;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- helpers (SECURITY DEFINER to avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_owner(_workspace_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id AND role = 'owner'
  );
$$;

-- workspaces policies
CREATE POLICY "Members can view workspaces" ON public.workspaces
  FOR SELECT TO authenticated USING (public.is_workspace_member(id, auth.uid()));
CREATE POLICY "Authenticated can create workspaces" ON public.workspaces
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner can update workspace" ON public.workspaces
  FOR UPDATE TO authenticated USING (public.is_workspace_owner(id, auth.uid())) WITH CHECK (public.is_workspace_owner(id, auth.uid()));
CREATE POLICY "Owner can delete workspace" ON public.workspaces
  FOR DELETE TO authenticated USING (public.is_workspace_owner(id, auth.uid()));

-- workspace_members policies
CREATE POLICY "Members can view members of their workspaces" ON public.workspace_members
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Owner can add members" ON public.workspace_members
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_owner(workspace_id, auth.uid()));
CREATE POLICY "Owner can update members" ON public.workspace_members
  FOR UPDATE TO authenticated USING (public.is_workspace_owner(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_owner(workspace_id, auth.uid()));
CREATE POLICY "Owner can remove members; members can leave" ON public.workspace_members
  FOR DELETE TO authenticated USING (public.is_workspace_owner(workspace_id, auth.uid()) OR user_id = auth.uid());

-- auto-add creator as owner
CREATE OR REPLACE FUNCTION public.handle_new_workspace()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner');
  RETURN NEW;
END;$$;
CREATE TRIGGER on_workspace_created
AFTER INSERT ON public.workspaces
FOR EACH ROW EXECUTE FUNCTION public.handle_new_workspace();

-- documents: reset and add workspace_id
TRUNCATE TABLE public.documents;
ALTER TABLE public.documents ADD COLUMN workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE;
REVOKE SELECT ON public.documents FROM anon;

DROP POLICY IF EXISTS "Anyone can view documents" ON public.documents;
DROP POLICY IF EXISTS "Anyone can insert documents" ON public.documents;
DROP POLICY IF EXISTS "Anyone can update documents" ON public.documents;
DROP POLICY IF EXISTS "Anyone can delete documents" ON public.documents;

CREATE POLICY "Members can view documents" ON public.documents
  FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members can insert documents" ON public.documents
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members can update documents" ON public.documents
  FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members can delete documents" ON public.documents
  FOR DELETE TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));

-- updated_at trigger on documents
DROP TRIGGER IF EXISTS update_documents_updated_at ON public.documents;
CREATE TRIGGER update_documents_updated_at
BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
