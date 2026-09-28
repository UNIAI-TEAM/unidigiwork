CREATE OR REPLACE FUNCTION public.notify_school_dept_brief(_brief_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _b public.school_briefs; _n int;
BEGIN
  IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO _b FROM public.school_briefs WHERE id=_brief_id;
  IF _b.id IS NULL OR _b.department IS NULL THEN RETURN 0; END IF;
  INSERT INTO public.notifications(tenant_id, scope_type, user_id, type, title, body, link, meta)
  SELECT _b.tenant_id, 'tenant', m.user_id, 'school.brief.dept', 'Bản tin buổi sáng · ' || _b.department, left(_b.content, 280), '/school-dept-directives',
    jsonb_build_object('brief_id', _b.id, 'department', _b.department)
  FROM public.tenant_members m
  JOIN public.tenant_member_profiles p ON p.tenant_id=m.tenant_id AND p.user_id=m.user_id
  WHERE m.tenant_id=_b.tenant_id AND m.status='active' AND m.role='manager' AND p.department=_b.department;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;
REVOKE ALL ON FUNCTION public.notify_school_dept_brief(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_school_dept_brief(uuid) TO service_role;