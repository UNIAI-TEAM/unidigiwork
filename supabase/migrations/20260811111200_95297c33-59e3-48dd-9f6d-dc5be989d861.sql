CREATE TABLE public.invite_email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role public.tenant_role NOT NULL,
  subject text NOT NULL,
  heading text NOT NULL,
  body text NOT NULL,
  cta_label text NOT NULL DEFAULT 'Chấp nhận lời mời',
  footer text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, role)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invite_email_templates TO authenticated;
GRANT ALL ON public.invite_email_templates TO service_role;

ALTER TABLE public.invite_email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invite_email_templates_select"
ON public.invite_email_templates FOR SELECT TO authenticated
USING (
  public.has_tenant_role(tenant_id, 'tenant_owner'::public.tenant_role)
  OR public.has_tenant_role(tenant_id, 'tenant_admin'::public.tenant_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "invite_email_templates_insert"
ON public.invite_email_templates FOR INSERT TO authenticated
WITH CHECK (
  public.has_tenant_role(tenant_id, 'tenant_owner'::public.tenant_role)
  OR public.has_tenant_role(tenant_id, 'tenant_admin'::public.tenant_role)
);

CREATE POLICY "invite_email_templates_update"
ON public.invite_email_templates FOR UPDATE TO authenticated
USING (
  public.has_tenant_role(tenant_id, 'tenant_owner'::public.tenant_role)
  OR public.has_tenant_role(tenant_id, 'tenant_admin'::public.tenant_role)
)
WITH CHECK (
  public.has_tenant_role(tenant_id, 'tenant_owner'::public.tenant_role)
  OR public.has_tenant_role(tenant_id, 'tenant_admin'::public.tenant_role)
);

CREATE POLICY "invite_email_templates_delete"
ON public.invite_email_templates FOR DELETE TO authenticated
USING (
  public.has_tenant_role(tenant_id, 'tenant_owner'::public.tenant_role)
  OR public.has_tenant_role(tenant_id, 'tenant_admin'::public.tenant_role)
);

CREATE TRIGGER trg_invite_email_templates_updated_at
BEFORE UPDATE ON public.invite_email_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();