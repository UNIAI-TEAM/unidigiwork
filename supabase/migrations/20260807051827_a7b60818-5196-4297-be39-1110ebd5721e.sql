CREATE TABLE public.workspace_invitation_defaults (
  invitation_id uuid PRIMARY KEY REFERENCES public.tenant_invitations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  workspace_role text NOT NULL DEFAULT 'member' CHECK (workspace_role IN ('owner','member')),
  can_edit boolean NOT NULL DEFAULT false,
  can_publish boolean NOT NULL DEFAULT false,
  can_run boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.workspace_invitation_defaults TO authenticated;
GRANT ALL ON public.workspace_invitation_defaults TO service_role;

ALTER TABLE public.workspace_invitation_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins can view invitation defaults"
ON public.workspace_invitation_defaults FOR SELECT TO authenticated
USING (
  public.has_tenant_role(tenant_id, 'tenant_owner'::public.tenant_role)
  OR public.has_tenant_role(tenant_id, 'tenant_admin'::public.tenant_role)
);

CREATE POLICY "Tenant admins can create invitation defaults"
ON public.workspace_invitation_defaults FOR INSERT TO authenticated
WITH CHECK (
  (
    public.has_tenant_role(tenant_id, 'tenant_owner'::public.tenant_role)
    OR public.has_tenant_role(tenant_id, 'tenant_admin'::public.tenant_role)
  )
  AND EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = workspace_id AND w.tenant_id = workspace_invitation_defaults.tenant_id
  )
  AND EXISTS (
    SELECT 1 FROM public.tenant_invitations i
    WHERE i.id = invitation_id AND i.tenant_id = workspace_invitation_defaults.tenant_id
  )
);

CREATE TRIGGER trg_workspace_invitation_defaults_updated_at
BEFORE UPDATE ON public.workspace_invitation_defaults
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.apply_workspace_invitation_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.workspace_invitation_defaults%ROWTYPE;
BEGIN
  IF NEW.status <> 'accepted' OR OLD.status = 'accepted' OR NEW.accepted_by IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO d FROM public.workspace_invitation_defaults WHERE invitation_id = NEW.id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (d.workspace_id, NEW.accepted_by, d.workspace_role)
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  IF d.can_edit OR d.can_publish OR d.can_run THEN
    INSERT INTO public.workflow_permissions
      (tenant_id, workspace_id, user_id, can_edit, can_publish, can_run, granted_by)
    VALUES
      (d.tenant_id, d.workspace_id, NEW.accepted_by, d.can_edit, d.can_publish, d.can_run, d.created_by)
    ON CONFLICT (workspace_id, user_id) DO UPDATE
      SET can_edit = EXCLUDED.can_edit,
          can_publish = EXCLUDED.can_publish,
          can_run = EXCLUDED.can_run,
          updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_workspace_invitation_defaults
AFTER UPDATE OF status ON public.tenant_invitations
FOR EACH ROW EXECUTE FUNCTION public.apply_workspace_invitation_defaults();