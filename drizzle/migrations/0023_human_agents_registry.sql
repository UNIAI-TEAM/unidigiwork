CREATE TABLE IF NOT EXISTS public.human_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  work_email text,
  domains text[] NOT NULL DEFAULT '{}',
  max_open_tasks integer NOT NULL DEFAULT 10,
  note text,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (tenant_id, user_id)
);

GRANT SELECT ON public.human_agents TO authenticated;
GRANT ALL ON public.human_agents TO service_role;

ALTER TABLE public.human_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS human_agents_select ON public.human_agents;
CREATE POLICY human_agents_select ON public.human_agents
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE OR REPLACE FUNCTION public.upsert_human_agent(
  _tenant_id uuid,
  _user_id uuid,
  _enabled boolean DEFAULT true,
  _work_email text DEFAULT NULL,
  _domains text[] DEFAULT '{}',
  _max_open_tasks integer DEFAULT 10,
  _note text DEFAULT NULL
)
RETURNS public.human_agents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.human_agents;
BEGIN
  IF NOT (public.has_tenant_role(_tenant_id, 'tenant_owner')
          OR public.has_tenant_role(_tenant_id, 'tenant_admin')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members m
    WHERE m.tenant_id = _tenant_id AND m.user_id = _user_id AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'VALIDATION_FAILED';
  END IF;

  IF _max_open_tasks IS NULL OR _max_open_tasks < 1 OR _max_open_tasks > 200 THEN
    RAISE EXCEPTION 'VALIDATION_FAILED';
  END IF;

  INSERT INTO public.human_agents AS ha
    (tenant_id, user_id, enabled, work_email, domains, max_open_tasks, note, created_by, updated_by)
  VALUES
    (_tenant_id, _user_id, COALESCE(_enabled, true), NULLIF(btrim(_work_email), ''),
     COALESCE(_domains, '{}'), _max_open_tasks, NULLIF(btrim(_note), ''), auth.uid(), auth.uid())
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    work_email = EXCLUDED.work_email,
    domains = EXCLUDED.domains,
    max_open_tasks = EXCLUDED.max_open_tasks,
    note = EXCLUDED.note,
    row_version = ha.row_version + 1,
    updated_at = now(),
    updated_by = auth.uid()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_human_agent(_tenant_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_tenant_role(_tenant_id, 'tenant_owner')
          OR public.has_tenant_role(_tenant_id, 'tenant_admin')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  DELETE FROM public.human_agents WHERE tenant_id = _tenant_id AND user_id = _user_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_human_agent(uuid, uuid, boolean, text, text[], integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_human_agent(uuid, uuid, boolean, text, text[], integer, text) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_human_agent(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_human_agent(uuid, uuid) TO authenticated;