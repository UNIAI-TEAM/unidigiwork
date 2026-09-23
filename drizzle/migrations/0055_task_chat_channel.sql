ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS chat_channels_task_unique
  ON public.chat_channels (task_id)
  WHERE task_id IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.ensure_task_chat_channel(_task_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_task public.tasks%ROWTYPE;
  v_channel_id uuid;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = _task_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESOURCE_NOT_FOUND';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = v_task.tenant_id AND tm.user_id = v_uid AND tm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT id INTO v_channel_id
  FROM public.chat_channels
  WHERE task_id = _task_id AND deleted_at IS NULL;

  IF v_channel_id IS NULL THEN
    v_name := left(regexp_replace(v_task.title, '[^[:alnum:] _-]', ' ', 'g'), 60)
              || ' ' || left(_task_id::text, 8);
    INSERT INTO public.chat_channels (
      tenant_id, workspace_id, task_id, name, description, kind, is_private, created_by, updated_by
    ) VALUES (
      v_task.tenant_id, v_task.workspace_id, _task_id, v_name, v_task.title,
      'channel', true, v_uid, v_uid
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_channel_id;

    IF v_channel_id IS NULL THEN
      SELECT id INTO v_channel_id FROM public.chat_channels
      WHERE task_id = _task_id AND deleted_at IS NULL;
    END IF;

    INSERT INTO public.chat_members (channel_id, user_id, tenant_id, role)
    SELECT v_channel_id, ta.user_id, v_task.tenant_id, 'member'
    FROM public.task_assignees ta
    WHERE ta.task_id = _task_id
    ON CONFLICT (channel_id, user_id) DO NOTHING;

    IF v_task.created_by IS NOT NULL THEN
      INSERT INTO public.chat_members (channel_id, user_id, tenant_id, role)
      VALUES (v_channel_id, v_task.created_by, v_task.tenant_id, 'member')
      ON CONFLICT (channel_id, user_id) DO NOTHING;
    END IF;
  END IF;

  INSERT INTO public.chat_members (channel_id, user_id, tenant_id, role)
  VALUES (v_channel_id, v_uid, v_task.tenant_id, 'member')
  ON CONFLICT (channel_id, user_id) DO NOTHING;

  RETURN v_channel_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_task_chat_channel(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.ensure_task_chat_channel(uuid) TO authenticated;