CREATE TABLE public.workflow_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('edit','publish','run')),
  workflow_id uuid,
  workflow_name text,
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewer_id uuid,
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_war_workspace_status ON public.workflow_access_requests(workspace_id, status, created_at DESC);
CREATE UNIQUE INDEX uq_war_pending ON public.workflow_access_requests(workspace_id, requester_id, action) WHERE status = 'pending';

GRANT SELECT ON public.workflow_access_requests TO authenticated;
GRANT ALL ON public.workflow_access_requests TO service_role;

ALTER TABLE public.workflow_access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view access requests"
ON public.workflow_access_requests FOR SELECT TO authenticated
USING (public.can_manage_workflow_permissions(workspace_id));

CREATE POLICY "Requesters can view own access requests"
ON public.workflow_access_requests FOR SELECT TO authenticated
USING (requester_id = auth.uid());

CREATE OR REPLACE FUNCTION public.request_workflow_access(
  _workspace_id uuid,
  _action text,
  _workflow_id uuid DEFAULT NULL,
  _message text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tenant uuid; _id uuid; _name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF _action NOT IN ('edit','publish','run') THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: action' USING ERRCODE='22023';
  END IF;
  SELECT tenant_id INTO _tenant FROM public.workspaces WHERE id = _workspace_id AND deleted_at IS NULL;
  IF _tenant IS NULL THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF NOT public.is_workspace_member(_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  SELECT id INTO _id FROM public.workflow_access_requests
  WHERE workspace_id = _workspace_id AND requester_id = auth.uid()
    AND action = _action AND status = 'pending';
  IF _id IS NOT NULL THEN RETURN _id; END IF;

  IF _workflow_id IS NOT NULL THEN
    SELECT name INTO _name FROM public.workflows WHERE id = _workflow_id;
  END IF;

  INSERT INTO public.workflow_access_requests(
    tenant_id, workspace_id, requester_id, action, workflow_id, workflow_name, message
  ) VALUES (_tenant, _workspace_id, auth.uid(), _action, _workflow_id, _name, NULLIF(btrim(COALESCE(_message,'')), ''))
  RETURNING id INTO _id;

  RETURN _id;
END $$;

GRANT EXECUTE ON FUNCTION public.request_workflow_access(uuid, text, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_workflow_access_requests(
  _workspace_id uuid,
  _status text DEFAULT NULL,
  _limit integer DEFAULT 50
) RETURNS TABLE(
  id uuid, created_at timestamptz, action text, status text,
  requester_id uuid, requester_name text, workflow_id uuid, workflow_name text,
  message text, reviewer_id uuid, reviewer_name text, reviewer_note text, reviewed_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT public.can_manage_workflow_permissions(_workspace_id) THEN
    RAISE EXCEPTION 'WORKSPACE_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT r.id, r.created_at, r.action, r.status, r.requester_id,
         COALESCE(u.display_name, u.primary_email), r.workflow_id, r.workflow_name,
         r.message, r.reviewer_id, COALESCE(rv.display_name, rv.primary_email),
         r.reviewer_note, r.reviewed_at
  FROM public.workflow_access_requests r
  LEFT JOIN public.users u ON u.id = r.requester_id
  LEFT JOIN public.users rv ON rv.id = r.reviewer_id
  WHERE r.workspace_id = _workspace_id
    AND (_status IS NULL OR r.status = _status)
  ORDER BY (r.status = 'pending') DESC, r.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 50), 200));
END $$;

GRANT EXECUTE ON FUNCTION public.list_workflow_access_requests(uuid, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_workflow_access_request(
  _request_id uuid,
  _approve boolean,
  _note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.workflow_access_requests%ROWTYPE;
        _edit boolean; _publish boolean; _run boolean; _owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.workflow_access_requests WHERE id = _request_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'RESOURCE_NOT_FOUND: request' USING ERRCODE='P0002'; END IF;
  IF NOT public.can_manage_workflow_permissions(r.workspace_id) THEN
    RAISE EXCEPTION 'WORKFLOW_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  IF r.status <> 'pending' THEN RETURN r.id; END IF;

  IF _approve THEN
    SELECT owner_id INTO _owner FROM public.workspaces WHERE id = r.workspace_id;
    SELECT p.can_edit, p.can_publish, p.can_run INTO _edit, _publish, _run
    FROM public.workflow_permissions p
    WHERE p.workspace_id = r.workspace_id AND p.user_id = r.requester_id;
    IF _edit IS NULL THEN
      _edit := (_owner = r.requester_id);
      _publish := (_owner = r.requester_id);
      _run := true;
    END IF;
    IF r.action = 'edit' THEN _edit := true;
    ELSIF r.action = 'publish' THEN _publish := true;
    ELSE _run := true; END IF;

    PERFORM public.set_workflow_permission(r.workspace_id, r.requester_id, _edit, _publish, _run);
  END IF;

  UPDATE public.workflow_access_requests
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
      reviewer_id = auth.uid(),
      reviewer_note = NULLIF(btrim(COALESCE(_note,'')), ''),
      reviewed_at = now(),
      updated_at = now()
  WHERE id = r.id;

  RETURN r.id;
END $$;

GRANT EXECUTE ON FUNCTION public.resolve_workflow_access_request(uuid, boolean, text) TO authenticated;