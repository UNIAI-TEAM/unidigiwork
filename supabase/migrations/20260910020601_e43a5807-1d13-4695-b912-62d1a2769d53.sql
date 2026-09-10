CREATE TABLE public.work_product_followers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  work_product_id uuid NOT NULL REFERENCES public.work_products(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_product_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.work_product_followers TO authenticated;
GRANT ALL ON public.work_product_followers TO service_role;

ALTER TABLE public.work_product_followers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "followers_select_tenant_members"
ON public.work_product_followers FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tenant_members tm
  WHERE tm.tenant_id = work_product_followers.tenant_id
    AND tm.user_id = auth.uid()
    AND tm.status = 'active'
));

CREATE POLICY "followers_insert_self"
ON public.work_product_followers FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = work_product_followers.tenant_id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
  AND EXISTS (
    SELECT 1 FROM public.work_products wp
    WHERE wp.id = work_product_followers.work_product_id
      AND wp.tenant_id = work_product_followers.tenant_id
  )
);

CREATE POLICY "followers_delete_self"
ON public.work_product_followers FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE INDEX idx_work_product_followers_product ON public.work_product_followers(work_product_id);
CREATE INDEX idx_work_product_followers_user ON public.work_product_followers(user_id);