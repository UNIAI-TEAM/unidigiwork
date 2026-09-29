CREATE TABLE public.school_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  description text CHECK (description IS NULL OR char_length(description) <= 300),
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (tenant_id, name)
);
GRANT SELECT ON public.school_departments TO authenticated;
GRANT ALL ON public.school_departments TO service_role;
ALTER TABLE public.school_departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read school departments" ON public.school_departments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id = school_departments.tenant_id AND m.user_id = auth.uid() AND m.status = 'active'));

-- Backfill from existing profile departments
INSERT INTO public.school_departments (tenant_id, name)
SELECT DISTINCT tenant_id, btrim(department) FROM public.tenant_member_profiles
WHERE department IS NOT NULL AND btrim(department) <> ''
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.school_list_departments(_tenant_id uuid)
RETURNS TABLE(id uuid, name text, description text, member_count integer, row_version integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, d.name, d.description,
    (SELECT count(*)::int FROM tenant_member_profiles p JOIN tenant_members m ON m.tenant_id=p.tenant_id AND m.user_id=p.user_id AND m.status='active'
      WHERE p.tenant_id=d.tenant_id AND btrim(p.department)=d.name),
    d.row_version
  FROM school_departments d
  WHERE d.tenant_id=_tenant_id
    AND EXISTS (SELECT 1 FROM tenant_members m WHERE m.tenant_id=_tenant_id AND m.user_id=auth.uid() AND m.status='active')
  ORDER BY d.name;
$$;

CREATE OR REPLACE FUNCTION public.school_save_department(_tenant_id uuid, _id uuid, _name text, _description text, _correlation_id text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_old text; v_id uuid; v_name text := btrim(coalesce(_name,''));
BEGIN
  IF NOT public._school_is_bgh(_tenant_id, v_uid) THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
  IF char_length(v_name) < 1 OR char_length(v_name) > 80 THEN RAISE EXCEPTION 'VALIDATION_FAILED'; END IF;
  IF EXISTS (SELECT 1 FROM school_departments WHERE tenant_id=_tenant_id AND name=v_name AND (_id IS NULL OR id<>_id)) THEN
    RAISE EXCEPTION 'DEPARTMENT_EXISTS'; END IF;
  IF _id IS NULL THEN
    INSERT INTO school_departments(tenant_id,name,description,created_by,updated_by)
    VALUES (_tenant_id, v_name, nullif(btrim(_description),''), v_uid, v_uid) RETURNING id INTO v_id;
    PERFORM _emit_outbox_event(_tenant_id,'school.department_created.v1','school_department',v_id::text,jsonb_build_object('name',v_name),NULL,_correlation_id);
  ELSE
    SELECT name INTO v_old FROM school_departments WHERE id=_id AND tenant_id=_tenant_id FOR UPDATE;
    IF v_old IS NULL THEN RAISE EXCEPTION 'DEPARTMENT_NOT_FOUND'; END IF;
    UPDATE school_departments SET name=v_name, description=nullif(btrim(_description),''), row_version=row_version+1, updated_at=now(), updated_by=v_uid WHERE id=_id;
    IF v_old <> v_name THEN
      UPDATE tenant_member_profiles SET department=v_name WHERE tenant_id=_tenant_id AND btrim(department)=v_old;
      UPDATE meetings SET department=v_name WHERE tenant_id=_tenant_id AND department=v_old;
      UPDATE tenant_invitations SET department=v_name WHERE tenant_id=_tenant_id AND department=v_old AND status='pending';
    END IF;
    v_id := _id;
    PERFORM _emit_outbox_event(_tenant_id,'school.department_updated.v1','school_department',v_id::text,jsonb_build_object('name',v_name,'old_name',v_old),NULL,_correlation_id);
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.school_delete_department(_tenant_id uuid, _id uuid, _target_id uuid, _correlation_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_old text; v_new text;
BEGIN
  IF NOT public._school_is_bgh(_tenant_id, v_uid) THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
  SELECT name INTO v_old FROM school_departments WHERE id=_id AND tenant_id=_tenant_id FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'DEPARTMENT_NOT_FOUND'; END IF;
  IF _target_id IS NULL OR _target_id=_id THEN RAISE EXCEPTION 'TARGET_REQUIRED'; END IF;
  SELECT name INTO v_new FROM school_departments WHERE id=_target_id AND tenant_id=_tenant_id;
  IF v_new IS NULL THEN RAISE EXCEPTION 'TARGET_REQUIRED'; END IF;
  UPDATE tenant_member_profiles SET department=v_new WHERE tenant_id=_tenant_id AND btrim(department)=v_old;
  UPDATE meetings SET department=v_new WHERE tenant_id=_tenant_id AND department=v_old;
  UPDATE tenant_invitations SET department=v_new WHERE tenant_id=_tenant_id AND department=v_old AND status='pending';
  DELETE FROM school_departments WHERE id=_id;
  PERFORM _emit_outbox_event(_tenant_id,'school.department_deleted.v1','school_department',_id::text,jsonb_build_object('name',v_old,'moved_to',v_new),NULL,_correlation_id);
END $$;

GRANT EXECUTE ON FUNCTION public.school_list_departments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.school_save_department(uuid,uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.school_delete_department(uuid,uuid,uuid,text) TO authenticated;