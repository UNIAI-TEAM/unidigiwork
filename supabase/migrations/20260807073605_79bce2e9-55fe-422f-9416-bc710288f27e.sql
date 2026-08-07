CREATE TABLE public.workflow_permission_denials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('edit','publish','run')),
  workflow_id uuid,
  workflow_name text,
  error_code text,
  source text NOT NULL DEFAULT 'server',
  correlation_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wpd_workspace_time ON public.workflow_permission_denials(workspace_id, occurred_at DESC);

GRANT SELECT ON public.workflow_permission_denials TO authenticated;
GRANT ALL ON public.workflow_permission_denials TO service_role;

ALTER TABLE public.workflow_permission_denials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view workflow denials"
ON public.workflow_permission_denials FOR SELECT TO authenticated
USING (public.can_manage_workflow_permissions(workspace_id));

CREATE OR REPLACE FUNCTION public.log_workflow_denial(
  _workspace_id uuid,
  _action text,
  _workflow_id uuid DEFAULT NULL,
  _error_code text DEFAULT NULL,
  _correlation_id text DEFAULT NULL,
  _source text DEFAULT 'server'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _id uuid; _tenant uuid; _name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF _action NOT IN ('edit','publish','run') THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: action' USING ERRCODE='22023';
  END IF;
  SELECT w.tenant_id INTO _tenant FROM public.workspaces w WHERE w.id = _workspace_id;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'RESOURCE_NOT_FOUND: workspace' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_tenant_member(_tenant, auth.uid()) THEN
    RAISE EXCEPTION 'TENANT_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  IF _workflow_id IS NOT NULL THEN
    SELECT wf.name INTO _name FROM public.workflows wf WHERE wf.id = _workflow_id;
  END IF;

  INSERT INTO public.workflow_permission_denials(
    tenant_id, workspace_id, user_id, action, workflow_id, workflow_name,
    error_code, source, correlation_id
  ) VALUES (
    _tenant, _workspace_id, auth.uid(), _action, _workflow_id, _name,
    _error_code, COALESCE(_source,'server'), _correlation_id
  ) RETURNING id INTO _id;

  RETURN _id;
END $$;

GRANT EXECUTE ON FUNCTION public.log_workflow_denial(uuid, text, uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_workflow_denials(
  _workspace_id uuid,
  _action text DEFAULT NULL,
  _limit integer DEFAULT 50
) RETURNS TABLE(
  id uuid, occurred_at timestamptz, action text, user_id uuid, user_name text,
  workflow_id uuid, workflow_name text, error_code text, source text, correlation_id text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT public.can_manage_workflow_permissions(_workspace_id) THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT d.id, d.occurred_at, d.action, d.user_id,
         COALESCE(u.display_name, u.primary_email),
         d.workflow_id, d.workflow_name, d.error_code, d.source, d.correlation_id
  FROM public.workflow_permission_denials d
  LEFT JOIN public.users u ON u.id = d.user_id
  WHERE d.workspace_id = _workspace_id
    AND (_action IS NULL OR d.action = _action)
  ORDER BY d.occurred_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 50), 200));
END $$;

GRANT EXECUTE ON FUNCTION public.list_workflow_denials(uuid, text, integer) TO authenticated;