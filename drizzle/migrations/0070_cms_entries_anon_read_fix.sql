DROP POLICY IF EXISTS cms_entries_public_read ON public.cms_entries;
CREATE POLICY cms_entries_anon_read ON public.cms_entries FOR SELECT TO anon USING (status = 'published');
CREATE POLICY cms_entries_auth_read ON public.cms_entries FOR SELECT TO authenticated
  USING (status = 'published' OR public.has_role(auth.uid(), 'admin'));