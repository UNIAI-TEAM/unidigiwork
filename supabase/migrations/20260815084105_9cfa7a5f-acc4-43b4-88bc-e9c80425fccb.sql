CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON public.workspace_members USING btree (user_id);

CREATE OR REPLACE FUNCTION public.get_unread_counts()
RETURNS TABLE(chat bigint, email bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*)
       FROM public.chat_messages m
       JOIN public.chat_members cm ON cm.channel_id = m.channel_id
      WHERE cm.user_id = auth.uid()
        AND m.deleted_at IS NULL
        AND m.author_id <> auth.uid()
        AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at))::bigint AS chat,
    (SELECT count(*)
       FROM public.email_states es
      WHERE es.user_id = auth.uid()
        AND es.folder = 'inbox'
        AND es.is_read = false)::bigint AS email
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_counts() TO authenticated;