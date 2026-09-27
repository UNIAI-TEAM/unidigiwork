ALTER TABLE public.cms_entries
  ADD COLUMN IF NOT EXISTS cover_path text,
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS publish_at timestamptz;
ALTER TABLE public.cms_entries DROP CONSTRAINT IF EXISTS cms_entries_kind_check;
ALTER TABLE public.cms_entries ADD CONSTRAINT cms_entries_kind_check CHECK (kind IN ('service','pricing','article','plan'));

DROP POLICY IF EXISTS cms_entries_anon_read ON public.cms_entries;
CREATE POLICY cms_entries_anon_read ON public.cms_entries FOR SELECT TO anon
  USING (status = 'published' AND (publish_at IS NULL OR publish_at <= now()));
DROP POLICY IF EXISTS cms_entries_auth_read ON public.cms_entries;
CREATE POLICY cms_entries_auth_read ON public.cms_entries FOR SELECT TO authenticated
  USING ((status = 'published' AND (publish_at IS NULL OR publish_at <= now())) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "cms media read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'cms-media');
CREATE POLICY "cms media admin insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cms-media' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cms media admin update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'cms-media' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cms media admin delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'cms-media' AND public.has_role(auth.uid(), 'admin'));