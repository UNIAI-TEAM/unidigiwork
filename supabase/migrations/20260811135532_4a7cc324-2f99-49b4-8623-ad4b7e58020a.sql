CREATE TABLE public.workspace_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#2563eb',
  description text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_tags TO authenticated;
GRANT ALL ON public.workspace_tags TO service_role;

ALTER TABLE public.workspace_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view workspace tags"
ON public.workspace_tags FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = workspace_tags.workspace_id AND m.user_id = auth.uid()));

CREATE POLICY "Members can create workspace tags"
ON public.workspace_tags FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = workspace_tags.workspace_id AND m.user_id = auth.uid()));

CREATE POLICY "Members can update workspace tags"
ON public.workspace_tags FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = workspace_tags.workspace_id AND m.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = workspace_tags.workspace_id AND m.user_id = auth.uid()));

CREATE POLICY "Members can delete workspace tags"
ON public.workspace_tags FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = workspace_tags.workspace_id AND m.user_id = auth.uid()));

CREATE TRIGGER update_workspace_tags_updated_at
BEFORE UPDATE ON public.workspace_tags
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();