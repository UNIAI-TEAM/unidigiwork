-- Phân quyền theo vai trò cho Human Agent: mỗi người có vai trò giao việc (admin/manager/staff),
-- và tổ chức quyết định vai trò nào được nhận việc từ orchestration.

ALTER TABLE public.human_agents
  ADD COLUMN IF NOT EXISTS assign_role text NOT NULL DEFAULT 'staff';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'human_agents_assign_role_check'
  ) THEN
    ALTER TABLE public.human_agents
      ADD CONSTRAINT human_agents_assign_role_check
      CHECK (assign_role IN ('admin','manager','staff'));
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.human_agent_role_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin','manager','staff')),
  can_receive_tasks boolean NOT NULL DEFAULT true,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (tenant_id, role)
);

GRANT SELECT ON public.human_agent_role_policies TO authenticated;
GRANT ALL ON public.human_agent_role_policies TO service_role;

ALTER TABLE public.human_agent_role_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS human_agent_role_policies_select ON public.human_agent_role_policies;
CREATE POLICY human_agent_role_policies_select
  ON public.human_agent_role_policies FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id));

CREATE OR REPLACE FUNCTION public.set_human_agent_role_policy(
  _tenant_id uuid,
  _role text,
  _can_receive_tasks boolean
) RETURNS public.human_agent_role_policies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.human_agent_role_policies;
BEGIN
  IF NOT (public.has_tenant_role(_tenant_id, 'tenant_owner')
          OR public.has_tenant_role(_tenant_id, 'tenant_admin')) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  IF _role IS NULL OR _role NOT IN ('admin','manager','staff') OR _can_receive_tasks IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_FAILED';
  END IF;

  INSERT INTO public.human_agent_role_policies AS p
    (tenant_id, role, can_receive_tasks, created_by, updated_by)
  VALUES (_tenant_id, _role, _can_receive_tasks, auth.uid(), auth.uid())
  ON CONFLICT (tenant_id, role) DO UPDATE SET
    can_receive_tasks = EXCLUDED.can_receive_tasks,
    row_version = p.row_version + 1,
    updated_at = now(),
    updated_by = auth.uid()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_human_agent_role_policy(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_human_agent_role_policy(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_human_agent_role_policy(uuid, text, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_human_agent(
  _tenant_id uuid,
  _user_id uuid,
  _enabled boolean DEFAULT true,
  _work_email text DEFAULT NULL::text,
  _domains text[] DEFAULT '{}'::text[],
  _max_open_tasks integer DEFAULT 10,
  _note text DEFAULT NULL::text,
  _assign_role text DEFAULT NULL::text
) RETURNS public.human_agents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.human_agents;
  v_role text;
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

  v_role := COALESCE(NULLIF(btrim(_assign_role), ''), 'staff');
  IF v_role NOT IN ('admin','manager','staff') THEN
    RAISE EXCEPTION 'VALIDATION_FAILED';
  END IF;

  INSERT INTO public.human_agents AS ha
    (tenant_id, user_id, enabled, work_email, domains, max_open_tasks, note, assign_role, created_by, updated_by)
  VALUES
    (_tenant_id, _user_id, COALESCE(_enabled, true), NULLIF(btrim(_work_email), ''),
     COALESCE(_domains, '{}'), _max_open_tasks, NULLIF(btrim(_note), ''), v_role, auth.uid(), auth.uid())
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    work_email = EXCLUDED.work_email,
    domains = EXCLUDED.domains,
    max_open_tasks = EXCLUDED.max_open_tasks,
    note = EXCLUDED.note,
    assign_role = EXCLUDED.assign_role,
    row_version = ha.row_version + 1,
    updated_at = now(),
    updated_by = auth.uid()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;
