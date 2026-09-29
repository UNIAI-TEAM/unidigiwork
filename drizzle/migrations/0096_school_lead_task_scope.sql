-- Tổ trưởng (manager có tổ, trong trường bật gói school) chỉ thấy/sửa công việc của tổ mình.
CREATE OR REPLACE FUNCTION public._school_lead_dept(_tenant_id uuid, _uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public._school_user_dept(_tenant_id, _uid)
  WHERE EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = _tenant_id AND t.industry_pack = 'school')
    AND EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id = _tenant_id AND m.user_id = _uid
                AND m.status = 'active' AND m.role = 'manager');
$$;

CREATE OR REPLACE FUNCTION public._school_lead_can_see_task(_tenant_id uuid, _task_id uuid, _owner uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN d IS NULL THEN true
    ELSE _owner = _uid OR public._school_task_in_dept(_tenant_id, _task_id, _owner, d) END
  FROM (SELECT public._school_lead_dept(_tenant_id, _uid) AS d) x;
$$;

REVOKE ALL ON FUNCTION public._school_lead_dept(uuid,uuid), public._school_lead_can_see_task(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._school_lead_dept(uuid,uuid), public._school_lead_can_see_task(uuid,uuid,uuid,uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS tasks_tenant_select ON public.tasks;
CREATE POLICY tasks_tenant_select ON public.tasks FOR SELECT TO authenticated
USING (is_tenant_member(tenant_id) AND deleted_at IS NULL
       AND public._school_lead_can_see_task(tenant_id, id, human_owner_id, auth.uid()));

CREATE OR REPLACE FUNCTION public._school_lead_task_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public._school_lead_can_see_task(OLD.tenant_id, OLD.id, OLD.human_owner_id, auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_school_lead_task_guard ON public.tasks;
CREATE TRIGGER trg_school_lead_task_guard BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public._school_lead_task_guard();