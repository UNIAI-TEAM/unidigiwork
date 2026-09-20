CREATE TABLE public.work_docx_recognition_profiles (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_guidance text NOT NULL DEFAULT '',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_docx_recognition_profiles TO authenticated;
GRANT ALL ON public.work_docx_recognition_profiles TO service_role;

ALTER TABLE public.work_docx_recognition_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wdrp_member_read" ON public.work_docx_recognition_profiles
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_members m
    WHERE m.tenant_id = work_docx_recognition_profiles.tenant_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  ));

CREATE POLICY "wdrp_admin_write" ON public.work_docx_recognition_profiles
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tenant_members m
    WHERE m.tenant_id = work_docx_recognition_profiles.tenant_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role IN ('tenant_owner','tenant_admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tenant_members m
    WHERE m.tenant_id = work_docx_recognition_profiles.tenant_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role IN ('tenant_owner','tenant_admin')
  ));

CREATE TRIGGER work_docx_recognition_profiles_updated_at
  BEFORE UPDATE ON public.work_docx_recognition_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();