CREATE TABLE public.task_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  priority text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_saved_views TO authenticated;
GRANT ALL ON public.task_saved_views TO service_role;

ALTER TABLE public.task_saved_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own task views"
ON public.task_saved_views FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_task_saved_views_updated_at
BEFORE UPDATE ON public.task_saved_views
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();