ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS meeting_id uuid REFERENCES public.meetings(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS chat_channels_meeting_unique
  ON public.chat_channels (meeting_id)
  WHERE meeting_id IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.ensure_meeting_chat_channel(_meeting_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_meeting public.meetings%ROWTYPE;
  v_channel_id uuid;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT * INTO v_meeting
  FROM public.meetings
  WHERE id = _meeting_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESOURCE_NOT_FOUND';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = v_meeting.tenant_id
      AND tm.user_id = v_uid
      AND tm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT id INTO v_channel_id
  FROM public.chat_channels
  WHERE meeting_id = _meeting_id AND deleted_at IS NULL;

  IF v_channel_id IS NULL THEN
    v_name := left(regexp_replace(v_meeting.title, '[^[:alnum:] _-]', ' ', 'g'), 60)
              || ' ' || left(_meeting_id::text, 8);
    INSERT INTO public.chat_channels (
      tenant_id, workspace_id, meeting_id, name, description, kind, is_private, created_by, updated_by
    ) VALUES (
      v_meeting.tenant_id,
      v_meeting.workspace_id,
      _meeting_id,
      v_name,
      v_meeting.title,
      'channel',
      true,
      v_uid,
      v_uid
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_channel_id;

    IF v_channel_id IS NULL THEN
      SELECT id INTO v_channel_id
      FROM public.chat_channels
      WHERE meeting_id = _meeting_id AND deleted_at IS NULL;
    END IF;

    INSERT INTO public.chat_members (channel_id, user_id, tenant_id, role)
    SELECT v_channel_id, mp.user_id, v_meeting.tenant_id, 'member'
    FROM public.meeting_participants mp
    WHERE mp.meeting_id = _meeting_id
    ON CONFLICT (channel_id, user_id) DO NOTHING;
  END IF;

  INSERT INTO public.chat_members (channel_id, user_id, tenant_id, role)
  VALUES (v_channel_id, v_uid, v_meeting.tenant_id, 'member')
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  RETURN v_channel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_meeting_chat_channel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_meeting_chat_channel(uuid) TO authenticated;