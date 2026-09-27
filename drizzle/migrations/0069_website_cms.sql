CREATE TABLE public.cms_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('service','pricing','article')),
  slug text NOT NULL,
  title text NOT NULL,
  summary text,
  body text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  sort_order integer NOT NULL DEFAULT 0,
  row_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  UNIQUE (kind, slug)
);
GRANT SELECT ON public.cms_entries TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cms_entries TO authenticated;
GRANT ALL ON public.cms_entries TO service_role;
ALTER TABLE public.cms_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY cms_entries_public_read ON public.cms_entries FOR SELECT TO anon, authenticated
  USING (status = 'published' OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY cms_entries_admin_insert ON public.cms_entries FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY cms_entries_admin_update ON public.cms_entries FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY cms_entries_admin_delete ON public.cms_entries FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.cms_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cms_settings TO authenticated;
GRANT ALL ON public.cms_settings TO service_role;
ALTER TABLE public.cms_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY cms_settings_admin ON public.cms_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Yêu cầu tư vấn công khai → lưu demo_requests + tạo Công việc trong workspace nhận lead.
CREATE OR REPLACE FUNCTION public.submit_consultation_request(
  _name text, _email text, _phone text, _company text, _service text, _message text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ws uuid; _tenant uuid; _req uuid; _task uuid;
BEGIN
  IF length(btrim(coalesce(_name,''))) NOT BETWEEN 1 AND 120
     OR coalesce(_email,'') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(_email) > 200
     OR length(coalesce(_phone,'')) > 40 OR length(coalesce(_company,'')) > 200
     OR length(coalesce(_service,'')) > 120 OR length(coalesce(_message,'')) > 4000 THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;
  INSERT INTO public.demo_requests(name, email, role, source, notes)
  VALUES (btrim(_name), lower(btrim(_email)), coalesce(nullif(btrim(_company),''),'—'), 'website_consult',
          concat_ws(E'\n', 'Dịch vụ: '||nullif(_service,''), 'SĐT: '||nullif(_phone,''), nullif(_message,'')))
  RETURNING id INTO _req;
  SELECT nullif(value->>'workspace_id','')::uuid INTO _ws FROM public.cms_settings WHERE key = 'lead_workspace';
  IF _ws IS NOT NULL THEN
    SELECT tenant_id INTO _tenant FROM public.workspaces WHERE id = _ws AND deleted_at IS NULL;
    IF _tenant IS NOT NULL THEN
      INSERT INTO public.tasks(tenant_id, workspace_id, title, description, priority, tags, due_at)
      VALUES (_tenant, _ws, left('Tư vấn: '||coalesce(nullif(_service,''),'Chung')||' — '||btrim(_name), 500),
              concat_ws(E'\n', 'Khách: '||btrim(_name), 'Email: '||_email, 'SĐT: '||nullif(_phone,''),
                        'Công ty: '||nullif(_company,''), 'Dịch vụ: '||nullif(_service,''), '', nullif(_message,''),
                        '', 'Nguồn: website (yêu cầu '||_req||')'),
              'high', ARRAY['consultation','website'], now() + interval '1 day')
      RETURNING id INTO _task;
      INSERT INTO public.audit_events(tenant_id, actor_user_id, action, resource_type, resource_id, payload)
      VALUES (_tenant, NULL, 'consultation.requested', 'task', _task, jsonb_build_object('request_id', _req));
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.submit_consultation_request(text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_consultation_request(text,text,text,text,text,text) TO anon, authenticated, service_role;