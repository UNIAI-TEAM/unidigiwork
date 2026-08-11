ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_channels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_members;

CREATE OR REPLACE FUNCTION public.create_chat_mention_notifications(
  _message_id uuid,
  _user_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m record;
  ch record;
  author_name text;
  inserted integer := 0;
BEGIN
  SELECT * INTO m FROM public.chat_messages WHERE id = _message_id;
  IF m IS NULL OR m.author_id <> auth.uid() THEN
    RETURN 0;
  END IF;

  SELECT * INTO ch FROM public.chat_channels WHERE id = m.channel_id;
  IF ch IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(u.display_name, u.primary_email, 'Thành viên') INTO author_name
  FROM public.users u WHERE u.id = m.author_id;

  INSERT INTO public.notifications
    (user_id, tenant_id, workspace_id, scope_type, type, title, body, link, meta, created_by)
  SELECT
    cm.user_id,
    m.tenant_id,
    ch.workspace_id,
    'tenant',
    'chat.mention',
    COALESCE(author_name, 'Thành viên') || ' đã nhắc bạn trong #' || ch.name,
    left(m.body, 200),
    '/chat/' || ch.id::text,
    jsonb_build_object('channelId', ch.id, 'messageId', m.id),
    m.author_id
  FROM public.chat_members cm
  WHERE cm.channel_id = m.channel_id
    AND cm.user_id = ANY(_user_ids)
    AND cm.user_id <> m.author_id;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.create_chat_mention_notifications(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_chat_mention_notifications(uuid, uuid[]) TO authenticated;