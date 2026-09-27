
-- Sửa RPC Cam kết: nhận _tenant_id tường minh + kiểm tra is_tenant_member (chuẩn dự án).

CREATE OR REPLACE FUNCTION public.create_commitment(
  _tenant_id uuid,
  _workspace_id uuid,
  _title text,
  _description text DEFAULT NULL,
  _counterparty text DEFAULT NULL,
  _owner_id uuid DEFAULT NULL,
  _due_at timestamptz DEFAULT NULL,
  _source_type text DEFAULT NULL,
  _source_id uuid DEFAULT NULL,
  _source_excerpt text DEFAULT NULL,
  _idempotency_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '28000'; END IF;
  IF NOT public.is_tenant_member(_tenant_id) THEN RAISE EXCEPTION 'TENANT_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO v_id FROM public.commitments
     WHERE tenant_id = _tenant_id AND title = _title
       AND COALESCE(source_type,'') = COALESCE(_source_type,'')
       AND COALESCE(source_id::text,'') = COALESCE(_source_id::text,'')
       AND created_by = auth.uid()
     ORDER BY created_at DESC LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  INSERT INTO public.commitments (tenant_id, workspace_id, title, description, counterparty, owner_id, due_at, source_type, source_id, source_excerpt, created_by, updated_by)
  VALUES (_tenant_id, _workspace_id, _title, _description, _counterparty, COALESCE(_owner_id, auth.uid()), _due_at, _source_type, _source_id, _source_excerpt, auth.uid(), auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.commitment_events (commitment_id, tenant_id, event_type, to_status, actor_id)
  VALUES (v_id, _tenant_id, 'CREATED', 'OPEN', auth.uid());
  INSERT INTO public.audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, payload)
  VALUES (_tenant_id, auth.uid(), 'COMMITMENT_CREATED', 'COMMITMENT', v_id, jsonb_build_object('title', _title));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.list_commitments(
  _tenant_id uuid,
  _status text DEFAULT NULL,
  _owner_id uuid DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
) RETURNS TABLE (
  id uuid, workspace_id uuid, title text, description text, counterparty text,
  status text, owner_id uuid, due_at timestamptz, source_type text, source_id uuid,
  source_excerpt text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_tenant_member(_tenant_id) THEN RAISE EXCEPTION 'TENANT_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT c.id, c.workspace_id, c.title, c.description, c.counterparty, c.status, c.owner_id,
         c.due_at, c.source_type, c.source_id, c.source_excerpt, c.created_at, c.updated_at
  FROM public.commitments c
  WHERE c.tenant_id = _tenant_id
    AND (_status IS NULL OR c.status = _status)
    AND (_owner_id IS NULL OR c.owner_id = _owner_id)
  ORDER BY c.created_at DESC
  LIMIT LEAST(_limit, 200) OFFSET _offset;
END $$;

CREATE OR REPLACE FUNCTION public.set_commitment_status(
  _commitment_id uuid,
  _status text,
  _note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_old text;
BEGIN
  IF _status NOT IN ('OPEN','IN_PROGRESS','FULFILLED','BROKEN','CANCELED') THEN
    RAISE EXCEPTION 'COMMITMENT_STATUS_INVALID' USING ERRCODE = 'P0001';
  END IF;
  SELECT c.tenant_id, c.status INTO v_tenant, v_old FROM public.commitments c WHERE c.id = _commitment_id;
  IF v_tenant IS NULL OR NOT public.is_tenant_member(v_tenant) THEN
    RAISE EXCEPTION 'COMMITMENT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_old = _status THEN RETURN; END IF;
  UPDATE public.commitments
     SET status = _status, updated_at = now(), updated_by = auth.uid(), row_version = row_version + 1
   WHERE id = _commitment_id;
  INSERT INTO public.commitment_events (commitment_id, tenant_id, event_type, from_status, to_status, note, actor_id)
  VALUES (_commitment_id, v_tenant, 'STATUS_CHANGED', v_old, _status, _note, auth.uid());
  INSERT INTO public.audit_events (tenant_id, actor_user_id, action, resource_type, resource_id, payload)
  VALUES (v_tenant, auth.uid(), 'COMMITMENT_STATUS_CHANGED', 'COMMITMENT', _commitment_id,
          jsonb_build_object('from', v_old, 'to', _status));
END $$;

CREATE OR REPLACE FUNCTION public.add_commitment_note(_commitment_id uuid, _note text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_id uuid;
BEGIN
  SELECT c.tenant_id INTO v_tenant FROM public.commitments c WHERE c.id = _commitment_id;
  IF v_tenant IS NULL OR NOT public.is_tenant_member(v_tenant) THEN
    RAISE EXCEPTION 'COMMITMENT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.commitment_events (commitment_id, tenant_id, event_type, note, actor_id)
  VALUES (_commitment_id, v_tenant, 'NOTE', _note, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.list_commitment_events(_commitment_id uuid)
RETURNS TABLE (id uuid, event_type text, from_status text, to_status text, note text, actor_id uuid, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT c.tenant_id INTO v_tenant FROM public.commitments c WHERE c.id = _commitment_id;
  IF v_tenant IS NULL OR NOT public.is_tenant_member(v_tenant) THEN
    RAISE EXCEPTION 'COMMITMENT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY
  SELECT e.id, e.event_type, e.from_status, e.to_status, e.note, e.actor_id, e.created_at
  FROM public.commitment_events e WHERE e.commitment_id = _commitment_id ORDER BY e.created_at;
END $$;

-- Bỏ chữ ký cũ không còn dùng (thiếu tham số tenant).
DROP FUNCTION IF EXISTS public.create_commitment(uuid, text, text, text, uuid, timestamptz, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.list_commitments(text, uuid, int, int);
