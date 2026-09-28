-- Bước 3: tổ chuyên môn = bộ phận (tenant_member_profiles.department); BGH = tenant_owner/tenant_admin; tổ trưởng = manager; giáo viên = member.
ALTER TABLE public.tenant_invitations ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE public.school_briefs ADD COLUMN IF NOT EXISTS department text;
CREATE INDEX IF NOT EXISTS idx_school_briefs_dept ON public.school_briefs(tenant_id, department, created_at DESC);

CREATE OR REPLACE FUNCTION public._school_is_bgh(_tenant_id uuid, _uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant_id AND m.user_id=_uid
    AND m.status='active' AND m.role IN ('tenant_owner','tenant_admin'))
$$;

CREATE OR REPLACE FUNCTION public._school_user_dept(_tenant_id uuid, _uid uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT nullif(btrim(p.department),'') FROM public.tenant_member_profiles p
  JOIN public.tenant_members m ON m.tenant_id=p.tenant_id AND m.user_id=p.user_id AND m.status='active'
  WHERE p.tenant_id=_tenant_id AND p.user_id=_uid
$$;

CREATE OR REPLACE FUNCTION public._school_can_view_dept(_tenant_id uuid, _dept text, _uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(auth.role(),'')='service_role' OR public._school_is_bgh(_tenant_id,_uid)
    OR (_dept IS NOT NULL AND _dept = public._school_user_dept(_tenant_id,_uid))
$$;

CREATE OR REPLACE FUNCTION public._school_task_in_dept(_tenant_id uuid, _task_id uuid, _owner uuid, _dept text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_member_profiles p
    WHERE p.tenant_id=_tenant_id AND btrim(p.department)=_dept
      AND (p.user_id=_owner OR p.user_id IN (SELECT a.user_id FROM public.task_assignees a WHERE a.task_id=_task_id))
  )
$$;

REVOKE ALL ON FUNCTION public._school_is_bgh(uuid,uuid), public._school_user_dept(uuid,uuid), public._school_can_view_dept(uuid,text,uuid), public._school_task_in_dept(uuid,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._school_is_bgh(uuid,uuid), public._school_user_dept(uuid,uuid), public._school_can_view_dept(uuid,text,uuid), public._school_task_in_dept(uuid,uuid,uuid,text) TO authenticated, service_role;

DROP POLICY IF EXISTS "school briefs read" ON public.school_briefs;
CREATE POLICY "school briefs read" ON public.school_briefs FOR SELECT TO authenticated
USING (
  CASE WHEN department IS NULL THEN public._school_is_bgh(tenant_id, auth.uid()) OR public._school_can_view_ws(tenant_id, workspace_id, auth.uid()) AND workspace_id IS NOT NULL AND workspace_id <> tenant_id
       ELSE public._school_can_view_dept(tenant_id, department, auth.uid()) END
);

-- Tổng hợp theo tổ
CREATE OR REPLACE FUNCTION public.school_overview_v2(_tenant_id uuid)
RETURNS TABLE(department text, members integer, open_tasks integer, overdue integer, blocked integer, done_7d integer, meetings_7d integer, overdue_titles text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
#variable_conflict use_column
DECLARE _uid uuid := auth.uid(); _svc boolean := coalesce(auth.role(),'')='service_role'; _bgh boolean; _mine text;
BEGIN
  IF NOT _svc AND NOT EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant_id AND m.user_id=_uid AND m.status='active') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  _bgh := _svc OR public._school_is_bgh(_tenant_id,_uid);
  _mine := public._school_user_dept(_tenant_id,_uid);
  RETURN QUERY
  WITH d AS (
    SELECT DISTINCT btrim(p.department) AS dn FROM public.tenant_member_profiles p
      JOIN public.tenant_members m ON m.tenant_id=p.tenant_id AND m.user_id=p.user_id AND m.status='active'
      WHERE p.tenant_id=_tenant_id AND nullif(btrim(p.department),'') IS NOT NULL
    UNION
    SELECT DISTINCT btrim(mt.department) FROM public.meetings mt
      WHERE mt.tenant_id=_tenant_id AND mt.deleted_at IS NULL AND nullif(btrim(mt.department),'') IS NOT NULL
  ), vis AS (SELECT dn FROM d WHERE _bgh OR dn=_mine),
  tk AS (
    SELECT v.dn, t.id, t.title, t.status, t.due_at, t.completed_at FROM vis v
    JOIN public.tasks t ON t.tenant_id=_tenant_id AND t.deleted_at IS NULL
      AND public._school_task_in_dept(_tenant_id, t.id, t.human_owner_id, v.dn)
  )
  SELECT v.dn,
    (SELECT count(*)::int FROM public.tenant_member_profiles p JOIN public.tenant_members m ON m.tenant_id=p.tenant_id AND m.user_id=p.user_id AND m.status='active' WHERE p.tenant_id=_tenant_id AND btrim(p.department)=v.dn),
    (SELECT count(*)::int FROM tk WHERE tk.dn=v.dn AND tk.status IN ('todo','in_progress','blocked')),
    (SELECT count(*)::int FROM tk WHERE tk.dn=v.dn AND tk.status IN ('todo','in_progress','blocked') AND tk.due_at < now()),
    (SELECT count(*)::int FROM tk WHERE tk.dn=v.dn AND tk.status='blocked'),
    (SELECT count(*)::int FROM tk WHERE tk.dn=v.dn AND tk.status='done' AND tk.completed_at >= now()-interval '7 days'),
    (SELECT count(*)::int FROM public.meetings mt WHERE mt.tenant_id=_tenant_id AND mt.deleted_at IS NULL AND btrim(mt.department)=v.dn AND mt.status IN ('scheduled','live') AND mt.start_at BETWEEN now() AND now()+interval '7 days'),
    ARRAY(SELECT tk.title::text FROM tk WHERE tk.dn=v.dn AND tk.status IN ('todo','in_progress','blocked') AND tk.due_at < now() ORDER BY tk.due_at LIMIT 5)
  FROM vis v ORDER BY v.dn;
END $$;

-- Thời gian biểu theo tổ (NULL = toàn trường, chỉ BGH)
CREATE OR REPLACE FUNCTION public.school_agenda_v2(_tenant_id uuid, _department text, _from timestamptz, _to timestamptz)
RETURNS TABLE(kind text, id uuid, title text, at timestamptz, end_at timestamptz, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
#variable_conflict use_column
DECLARE _uid uuid := auth.uid(); _bgh boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant_id AND m.user_id=_uid AND m.status='active') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _to - _from > interval '62 days' THEN RAISE EXCEPTION 'RANGE_TOO_LARGE'; END IF;
  _bgh := public._school_is_bgh(_tenant_id,_uid);
  IF _department IS NULL AND NOT _bgh THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _department IS NOT NULL AND NOT public._school_can_view_dept(_tenant_id,_department,_uid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN QUERY
  WITH items AS (
    SELECT 'meeting'::text AS k, mt.id AS i, mt.title::text AS ti, mt.start_at AS a, mt.end_at AS e, mt.status::text AS s
      FROM public.meetings mt WHERE mt.tenant_id=_tenant_id AND mt.deleted_at IS NULL AND mt.status <> 'canceled'
        AND mt.start_at >= _from AND mt.start_at < _to
        AND (_department IS NULL OR btrim(mt.department)=_department)
    UNION ALL
    SELECT 'task'::text, t.id, t.title::text, t.due_at, NULL::timestamptz, t.status::text
      FROM public.tasks t WHERE t.tenant_id=_tenant_id AND t.deleted_at IS NULL AND t.status <> 'canceled'
        AND t.due_at >= _from AND t.due_at < _to
        AND (_department IS NULL OR public._school_task_in_dept(_tenant_id, t.id, t.human_owner_id, _department))
    UNION ALL
    SELECT 'brief'::text, b.id, b.trigger::text, b.created_at, NULL::timestamptz, b.status::text
      FROM public.school_briefs b WHERE b.tenant_id=_tenant_id AND b.created_at >= _from AND b.created_at < _to
        AND b.department IS NOT DISTINCT FROM _department
  )
  SELECT items.k, items.i, items.ti, items.a, items.e, items.s FROM items ORDER BY items.a;
END $$;

CREATE OR REPLACE FUNCTION public.list_school_briefs_v2(_tenant_id uuid, _department text, _limit integer DEFAULT 10)
RETURNS SETOF public.school_briefs LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT * FROM public.school_briefs WHERE tenant_id=_tenant_id AND department IS NOT DISTINCT FROM _department
  ORDER BY created_at DESC LIMIT least(greatest(_limit,1),50)
$$;

CREATE OR REPLACE FUNCTION public.save_school_brief_v2(_tenant_id uuid, _department text, _content text, _facts jsonb, _trigger text, _status text, _idempotency_key text DEFAULT NULL, _correlation_id text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _svc boolean := coalesce(auth.role(),'')='service_role'; _id uuid;
BEGIN
  IF NOT _svc THEN
    IF _uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    IF _trigger='scheduled' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    IF NOT public._school_is_bgh(_tenant_id,_uid) THEN
      IF _department IS NULL OR _department IS DISTINCT FROM public._school_user_dept(_tenant_id,_uid)
         OR NOT EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant_id AND m.user_id=_uid AND m.status='active' AND m.role='manager') THEN
        RAISE EXCEPTION 'FORBIDDEN';
      END IF;
    END IF;
  END IF;
  IF _idempotency_key IS NOT NULL THEN
    SELECT b.id INTO _id FROM public.school_briefs b WHERE b.tenant_id=_tenant_id AND b.idempotency_key=_idempotency_key;
    IF _id IS NOT NULL THEN RETURN _id; END IF;
  END IF;
  INSERT INTO public.school_briefs(tenant_id, workspace_id, department, trigger, status, content, facts, idempotency_key, created_by, updated_by)
  VALUES (_tenant_id, NULL, _department, _trigger, _status, left(coalesce(_content,''),20000), coalesce(_facts,'[]'::jsonb), _idempotency_key, _uid, _uid)
  RETURNING id INTO _id;
  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (_tenant_id, _uid, 'school.brief_created', 'school_brief', _id::text,
    jsonb_build_object('department',_department,'trigger',_trigger,'status',_status,'idempotency_key',_idempotency_key), _correlation_id);
  PERFORM public._emit_outbox_event(_tenant_id, 'school.brief_created.v1', 'school_brief', _id::text,
    jsonb_build_object('brief_id',_id,'department',_department,'trigger',_trigger), _idempotency_key, _correlation_id);
  RETURN _id;
END $$;

-- Nhân sự trường
CREATE OR REPLACE FUNCTION public.school_staff(_tenant_id uuid)
RETURNS TABLE(user_id uuid, display_name text, email text, role text, department text, title text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
#variable_conflict use_column
DECLARE _uid uuid := auth.uid(); _bgh boolean; _mine text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenant_members m WHERE m.tenant_id=_tenant_id AND m.user_id=_uid AND m.status='active') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  _bgh := public._school_is_bgh(_tenant_id,_uid);
  _mine := public._school_user_dept(_tenant_id,_uid);
  RETURN QUERY
  SELECT m.user_id, coalesce(u.display_name, pr.display_name)::text, coalesce(u.primary_email, pr.email)::text, m.role::text,
         nullif(btrim(p.department),''), p.title
  FROM public.tenant_members m
  LEFT JOIN public.users u ON u.id=m.user_id
  LEFT JOIN public.profiles pr ON pr.id=m.user_id
  LEFT JOIN public.tenant_member_profiles p ON p.tenant_id=m.tenant_id AND p.user_id=m.user_id
  WHERE m.tenant_id=_tenant_id AND m.status='active'
    AND (_bgh OR m.user_id=_uid OR (_mine IS NOT NULL AND btrim(p.department)=_mine))
  ORDER BY nullif(btrim(p.department),'') NULLS LAST, m.role, 2;
END $$;

CREATE OR REPLACE FUNCTION public.set_school_staff(_tenant_id uuid, _user_id uuid, _role text, _department text, _correlation_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _cur text; _caller text; _dept text := nullif(btrim(coalesce(_department,'')),'');
BEGIN
  IF _uid IS NULL OR NOT public._school_is_bgh(_tenant_id,_uid) THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
  IF _dept IS NOT NULL AND length(_dept) > 80 THEN RAISE EXCEPTION 'VALIDATION_FAILED'; END IF;
  SELECT m.role::text INTO _cur FROM public.tenant_members m WHERE m.tenant_id=_tenant_id AND m.user_id=_user_id AND m.status='active';
  IF _cur IS NULL THEN RAISE EXCEPTION 'TENANT_MEMBERSHIP_NOT_FOUND'; END IF;
  SELECT m.role::text INTO _caller FROM public.tenant_members m WHERE m.tenant_id=_tenant_id AND m.user_id=_uid;
  IF _role IS NOT NULL AND _role <> _cur THEN
    IF _role NOT IN ('tenant_admin','manager','member') THEN RAISE EXCEPTION 'VALIDATION_FAILED'; END IF;
    IF _cur='tenant_owner' THEN RAISE EXCEPTION 'TENANT_LAST_OWNER_PROTECTED'; END IF;
    IF (_role='tenant_admin' OR _cur='tenant_admin') AND _caller <> 'tenant_owner' THEN RAISE EXCEPTION 'TENANT_ROLE_CHANGE_FORBIDDEN'; END IF;
    UPDATE public.tenant_members SET role=_role::tenant_role, updated_at=now() WHERE tenant_id=_tenant_id AND user_id=_user_id;
  END IF;
  INSERT INTO public.tenant_member_profiles(tenant_id, user_id, department) VALUES (_tenant_id, _user_id, _dept)
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET department=EXCLUDED.department, updated_at=now();
  INSERT INTO public.audit_events(tenant_id, actor_id, event_type, aggregate_type, aggregate_id, payload, correlation_id)
  VALUES (_tenant_id, _uid, 'school.staff_updated', 'tenant_member', _user_id::text,
    jsonb_build_object('from_role',_cur,'role',coalesce(_role,_cur),'department',_dept), _correlation_id);
  PERFORM public._emit_outbox_event(_tenant_id, 'school.staff_updated.v1', 'tenant_member', _user_id::text,
    jsonb_build_object('user_id',_user_id,'role',coalesce(_role,_cur),'department',_dept), NULL, _correlation_id);
END $$;

CREATE OR REPLACE FUNCTION public.school_invite(_tenant_id uuid, _email text, _role text, _department text, _token_hash text, _expires_at timestamptz, _correlation_id text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _inv public.tenant_invitations; _caller text; _dept text := nullif(btrim(coalesce(_department,'')),'');
BEGIN
  IF _uid IS NULL OR NOT public._school_is_bgh(_tenant_id,_uid) THEN RAISE EXCEPTION 'PERMISSION_DENIED'; END IF;
  IF _role NOT IN ('tenant_admin','manager','member') THEN RAISE EXCEPTION 'VALIDATION_FAILED'; END IF;
  SELECT m.role::text INTO _caller FROM public.tenant_members m WHERE m.tenant_id=_tenant_id AND m.user_id=_uid;
  IF _role='tenant_admin' AND _caller <> 'tenant_owner' THEN RAISE EXCEPTION 'TENANT_ROLE_CHANGE_FORBIDDEN'; END IF;
  IF _dept IS NOT NULL AND length(_dept) > 80 THEN RAISE EXCEPTION 'VALIDATION_FAILED'; END IF;
  _inv := public.create_tenant_invitation(_tenant_id, _email, _role::tenant_role, _token_hash, _expires_at, _correlation_id);
  UPDATE public.tenant_invitations SET department=_dept WHERE id=_inv.id;
  RETURN _inv.id;
END $$;

-- Khi lời mời được chấp nhận: gán tổ cho thành viên mới
CREATE OR REPLACE FUNCTION public._school_apply_invite_department() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status='accepted' AND OLD.status IS DISTINCT FROM 'accepted' AND NEW.accepted_by IS NOT NULL AND nullif(btrim(coalesce(NEW.department,'')),'') IS NOT NULL THEN
    INSERT INTO public.tenant_member_profiles(tenant_id, user_id, department) VALUES (NEW.tenant_id, NEW.accepted_by, btrim(NEW.department))
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET department=EXCLUDED.department, updated_at=now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_school_apply_invite_department ON public.tenant_invitations;
CREATE TRIGGER trg_school_apply_invite_department AFTER UPDATE ON public.tenant_invitations
FOR EACH ROW EXECUTE FUNCTION public._school_apply_invite_department();

REVOKE ALL ON FUNCTION public.school_overview_v2(uuid), public.school_agenda_v2(uuid,text,timestamptz,timestamptz), public.list_school_briefs_v2(uuid,text,integer),
  public.save_school_brief_v2(uuid,text,text,jsonb,text,text,text,text), public.school_staff(uuid), public.set_school_staff(uuid,uuid,text,text,text),
  public.school_invite(uuid,text,text,text,text,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_overview_v2(uuid), public.school_agenda_v2(uuid,text,timestamptz,timestamptz), public.list_school_briefs_v2(uuid,text,integer),
  public.save_school_brief_v2(uuid,text,text,jsonb,text,text,text,text), public.school_staff(uuid), public.set_school_staff(uuid,uuid,text,text,text),
  public.school_invite(uuid,text,text,text,text,timestamptz,text) TO authenticated, service_role;