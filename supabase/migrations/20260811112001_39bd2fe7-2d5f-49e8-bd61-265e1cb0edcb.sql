CREATE TABLE public.invite_email_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role tenant_role NOT NULL,
  version integer NOT NULL,
  action text NOT NULL DEFAULT 'update',
  subject text NOT NULL,
  heading text NOT NULL,
  body text NOT NULL,
  cta_label text NOT NULL,
  footer text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.invite_email_template_versions TO authenticated;
GRANT ALL ON public.invite_email_template_versions TO service_role;

ALTER TABLE public.invite_email_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invite_email_template_versions_select" ON public.invite_email_template_versions
  FOR SELECT TO authenticated
  USING (has_tenant_role(tenant_id, 'tenant_owner'::tenant_role) OR has_tenant_role(tenant_id, 'tenant_admin'::tenant_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "invite_email_template_versions_insert" ON public.invite_email_template_versions
  FOR INSERT TO authenticated
  WITH CHECK (has_tenant_role(tenant_id, 'tenant_owner'::tenant_role) OR has_tenant_role(tenant_id, 'tenant_admin'::tenant_role));

CREATE INDEX idx_iet_versions_tenant_role ON public.invite_email_template_versions (tenant_id, role, version DESC);

CREATE OR REPLACE FUNCTION public.log_invite_email_template_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
  r record;
  v_action text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    r := OLD;
    v_action := 'reset';
  ELSIF TG_OP = 'INSERT' THEN
    r := NEW;
    v_action := 'create';
  ELSE
    r := NEW;
    v_action := 'update';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
  FROM public.invite_email_template_versions
  WHERE tenant_id = r.tenant_id AND role = r.role;

  INSERT INTO public.invite_email_template_versions
    (tenant_id, role, version, action, subject, heading, body, cta_label, footer, is_active, changed_by)
  VALUES
    (r.tenant_id, r.role, v_next, v_action, r.subject, r.heading, r.body, r.cta_label, r.footer, r.is_active,
     COALESCE(r.updated_by, auth.uid()));

  RETURN r;
END;
$$;

CREATE TRIGGER trg_invite_email_templates_versioning
AFTER INSERT OR UPDATE OR DELETE ON public.invite_email_templates
FOR EACH ROW EXECUTE FUNCTION public.log_invite_email_template_version();