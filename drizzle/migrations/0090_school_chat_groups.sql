CREATE OR REPLACE FUNCTION public.school_list_chat_groups(_tenant_id uuid)
RETURNS TABLE(id uuid, name text, description text, is_dept boolean, member_ids uuid[], created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._school_is_bgh(_tenant_id, auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT c.id, c.name, c.description, c.school_department_id IS NOT NULL,
    COALESCE((SELECT array_agg(m.user_id) FROM chat_members m WHERE m.channel_id=c.id), '{}'::uuid[]), c.created_at
  FROM chat_channels c
  WHERE c.tenant_id=_tenant_id AND c.deleted_at IS NULL AND c.kind='channel'
    AND c.meeting_id IS NULL AND c.task_id IS NULL AND COALESCE(c.is_general,false)=false
  ORDER BY (c.school_department_id IS NULL), c.name;
END $$;

CREATE OR REPLACE FUNCTION public.school_save_chat_group(_tenant_id uuid, _id uuid, _name text, _description text, _correlation_id text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _ws uuid; _cid uuid; _c chat_channels;
BEGIN
  IF NOT public._school_is_bgh(_tenant_id, _uid) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF char_length(btrim(_name)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'INVALID_NAME'; END IF;
  IF _id IS NULL THEN
    SELECT w.id INTO _ws FROM workspaces w WHERE w.tenant_id=_tenant_id ORDER BY w.created_at LIMIT 1;
    INSERT INTO chat_channels(tenant_id, workspace_id, name, description, kind, is_private, created_by, updated_by)
    VALUES (_tenant_id, _ws, btrim(_name), NULLIF(btrim(_description),''), 'channel', true, _uid, _uid) RETURNING id INTO _cid;
    INSERT INTO chat_members(channel_id, user_id, tenant_id, role) VALUES (_cid, _uid, _tenant_id, 'owner') ON CONFLICT DO NOTHING;
    PERFORM public._emit_outbox_event(_tenant_id, 'school.chat_group.created', 'chat_channel', _cid::text, jsonb_build_object('id',_cid,'actor_id',_uid), NULL, _correlation_id);
    RETURN _cid;
  END IF;
  SELECT * INTO _c FROM chat_channels WHERE id=_id AND tenant_id=_tenant_id AND deleted_at IS NULL;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF _c.school_department_id IS NOT NULL THEN RAISE EXCEPTION 'DEPT_GROUP'; END IF;
  UPDATE chat_channels SET name=btrim(_name), description=NULLIF(btrim(_description),''), updated_by=_uid, updated_at=now(), row_version=row_version+1 WHERE id=_id;
  PERFORM public._emit_outbox_event(_tenant_id, 'school.chat_group.renamed', 'chat_channel', _id::text, jsonb_build_object('id',_id,'actor_id',_uid), NULL, _correlation_id);
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.school_delete_chat_group(_tenant_id uuid, _id uuid, _correlation_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _c chat_channels;
BEGIN
  IF NOT public._school_is_bgh(_tenant_id, _uid) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO _c FROM chat_channels WHERE id=_id AND tenant_id=_tenant_id AND deleted_at IS NULL;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF _c.school_department_id IS NOT NULL THEN RAISE EXCEPTION 'DEPT_GROUP'; END IF;
  UPDATE chat_channels SET deleted_at=now(), updated_by=_uid, updated_at=now() WHERE id=_id;
  PERFORM public._emit_outbox_event(_tenant_id, 'school.chat_group.deleted', 'chat_channel', _id::text, jsonb_build_object('id',_id,'actor_id',_uid), NULL, _correlation_id);
END $$;

CREATE OR REPLACE FUNCTION public.school_set_chat_member(_tenant_id uuid, _channel_id uuid, _user_id uuid, _add boolean, _correlation_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF NOT public._school_is_bgh(_tenant_id, _uid) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM chat_channels WHERE id=_channel_id AND tenant_id=_tenant_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF _add THEN
    IF NOT EXISTS (SELECT 1 FROM tenant_members WHERE tenant_id=_tenant_id AND user_id=_user_id AND status='active') THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
    INSERT INTO chat_members(channel_id, user_id, tenant_id, role) VALUES (_channel_id, _user_id, _tenant_id, 'member') ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM chat_members WHERE channel_id=_channel_id AND user_id=_user_id;
  END IF;
  PERFORM public._emit_outbox_event(_tenant_id, CASE WHEN _add THEN 'school.chat_group.member_added' ELSE 'school.chat_group.member_removed' END,
    'chat_channel', _channel_id::text, jsonb_build_object('id',_channel_id,'user_id',_user_id,'actor_id',_uid), NULL, _correlation_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.school_list_chat_groups(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.school_save_chat_group(uuid,uuid,text,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.school_delete_chat_group(uuid,uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.school_set_chat_member(uuid,uuid,uuid,boolean,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.school_list_chat_groups(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.school_save_chat_group(uuid,uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.school_delete_chat_group(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.school_set_chat_member(uuid,uuid,uuid,boolean,text) TO authenticated;