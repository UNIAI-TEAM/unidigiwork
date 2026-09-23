ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS is_general boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS chat_channels_tenant_general_unique
  ON public.chat_channels (tenant_id)
  WHERE is_general AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.ensure_tenant_general_channel(_tenant_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_channel uuid;
  v_workspace uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = _tenant_id
      AND tm.user_id = v_user
      AND tm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT id INTO v_channel
  FROM public.chat_channels
  WHERE tenant_id = _tenant_id AND is_general AND deleted_at IS NULL
  LIMIT 1;

  IF v_channel IS NULL THEN
    SELECT id INTO v_workspace
    FROM public.workspaces
    WHERE tenant_id = _tenant_id
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_workspace IS NULL THEN
      RAISE EXCEPTION 'RESOURCE_NOT_FOUND';
    END IF;

    INSERT INTO public.chat_channels (
      tenant_id, workspace_id, name, description, kind, is_private, is_general, created_by, updated_by
    ) VALUES (
      _tenant_id, v_workspace, 'Toàn tổ chức',
      'Phòng trò chuyện chung của tổ chức', 'channel', false, true, v_user, v_user
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_channel;

    IF v_channel IS NULL THEN
      SELECT id INTO v_channel
      FROM public.chat_channels
      WHERE tenant_id = _tenant_id AND is_general AND deleted_at IS NULL
      LIMIT 1;
    END IF;
  END IF;

  -- Mọi thành viên đang hoạt động của tổ chức đều thuộc phòng chung.
  INSERT INTO public.chat_members (channel_id, user_id, tenant_id, role)
  SELECT v_channel, tm.user_id, _tenant_id,
         CASE WHEN tm.user_id = v_user THEN 'member' ELSE 'member' END
  FROM public.tenant_members tm
  WHERE tm.tenant_id = _tenant_id AND tm.status = 'active'
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  RETURN v_channel;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_tenant_general_channel(uuid) TO authenticated;