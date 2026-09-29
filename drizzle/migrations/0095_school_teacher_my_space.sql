ALTER TABLE public.tenant_member_profiles
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS avatar_bucket text,
  ADD COLUMN IF NOT EXISTS avatar_object_key text;

CREATE POLICY "member_avatars_read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'member-avatars' AND public.is_tenant_member((storage.foldername(name))[1]::uuid));
CREATE POLICY "member_avatars_insert_own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'member-avatars' AND public.is_tenant_member((storage.foldername(name))[1]::uuid) AND (storage.foldername(name))[2] = auth.uid()::text);
CREATE POLICY "member_avatars_delete_own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'member-avatars' AND (storage.foldername(name))[2] = auth.uid()::text);

CREATE OR REPLACE FUNCTION public.school_get_my_profile(_tenant_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'display_name', u.display_name, 'email', u.primary_email,
    'phone', p.phone, 'title', p.title, 'subject', p.subject, 'department', p.department,
    'avatar_bucket', p.avatar_bucket, 'avatar_object_key', p.avatar_object_key)
  FROM public.users u
  LEFT JOIN public.tenant_member_profiles p ON p.tenant_id = _tenant_id AND p.user_id = u.id
  WHERE u.id = auth.uid() AND public.is_tenant_member(_tenant_id);
$$;

CREATE OR REPLACE FUNCTION public.school_update_my_profile(
  _tenant_id uuid, _display_name text, _phone text, _title text, _subject text,
  _avatar_object_key text, _idempotency_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.is_tenant_member(_tenant_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF coalesce(btrim(_display_name),'') = '' THEN RAISE EXCEPTION 'NAME_REQUIRED'; END IF;
  IF _avatar_object_key IS NOT NULL AND _avatar_object_key NOT LIKE _tenant_id::text || '/' || _uid::text || '/%' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  UPDATE public.users SET display_name = btrim(_display_name), updated_at = now() WHERE id = _uid;
  INSERT INTO public.tenant_member_profiles (tenant_id, user_id, phone, title, subject, avatar_bucket, avatar_object_key)
  VALUES (_tenant_id, _uid, nullif(btrim(_phone),''), nullif(btrim(_title),''), nullif(btrim(_subject),''),
          CASE WHEN _avatar_object_key IS NULL THEN NULL ELSE 'member-avatars' END, _avatar_object_key)
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    phone = EXCLUDED.phone, title = EXCLUDED.title, subject = EXCLUDED.subject,
    avatar_bucket = coalesce(EXCLUDED.avatar_bucket, tenant_member_profiles.avatar_bucket),
    avatar_object_key = coalesce(EXCLUDED.avatar_object_key, tenant_member_profiles.avatar_object_key),
    updated_at = now();
  PERFORM public._emit_outbox_event(_tenant_id, 'school.member_profile.updated', 'tenant_member', _uid::text,
    jsonb_build_object('user_id', _uid), _idempotency_key, _idempotency_key);
END; $$;

CREATE OR REPLACE FUNCTION public.school_list_my_plans(_tenant_id uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(id uuid, kind text, title text, class_name text, starts_at timestamptz, ends_at timestamptz,
  department text, task_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.kind, p.title, p.class_name, p.starts_at, p.ends_at, p.department, t.status::text
  FROM public.school_dept_plans p LEFT JOIN public.tasks t ON t.id = p.task_id
  WHERE p.tenant_id = _tenant_id AND p.created_by = auth.uid() AND public.is_tenant_member(_tenant_id)
    AND p.kind IN ('lesson','assignment')
    AND coalesce(p.starts_at, p.ends_at, p.created_at) BETWEEN _from AND _to
  ORDER BY coalesce(p.starts_at, p.ends_at, p.created_at);
$$;

REVOKE ALL ON FUNCTION public.school_get_my_profile(uuid), public.school_update_my_profile(uuid,text,text,text,text,text,text), public.school_list_my_plans(uuid,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.school_get_my_profile(uuid), public.school_update_my_profile(uuid,text,text,text,text,text,text), public.school_list_my_plans(uuid,timestamptz,timestamptz) TO authenticated, service_role;