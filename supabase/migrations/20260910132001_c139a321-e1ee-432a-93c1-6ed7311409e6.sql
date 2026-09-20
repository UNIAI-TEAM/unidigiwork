CREATE TABLE public.task_followers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.task_followers TO authenticated;
GRANT ALL ON public.task_followers TO service_role;

ALTER TABLE public.task_followers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_followers_select_tenant_members"
ON public.task_followers FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tenant_members tm
  WHERE tm.tenant_id = task_followers.tenant_id
    AND tm.user_id = auth.uid()
    AND tm.status = 'active'
));

CREATE POLICY "task_followers_insert_self"
ON public.task_followers FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = task_followers.tenant_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_followers.task_id
      AND t.tenant_id = task_followers.tenant_id
  )
);

CREATE POLICY "task_followers_delete_self"
ON public.task_followers FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE INDEX idx_task_followers_task ON public.task_followers(task_id);
CREATE INDEX idx_task_followers_user ON public.task_followers(user_id);