DROP POLICY IF EXISTS plans_read_all ON public.plans;
CREATE POLICY plans_read_anon ON public.plans FOR SELECT TO anon USING (is_active);
CREATE POLICY plans_read_auth ON public.plans FOR SELECT TO authenticated USING (is_active OR has_role(auth.uid(), 'admin'::app_role));