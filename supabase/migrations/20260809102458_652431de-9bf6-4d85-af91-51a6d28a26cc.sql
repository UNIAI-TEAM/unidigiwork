REVOKE EXECUTE ON FUNCTION public.is_chat_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_chat_channel_admin(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_view_chat_channel(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.bump_chat_channel_activity() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.chat_members_touch_updated_at() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_chat_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_chat_channel_admin(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_chat_channel(uuid, uuid) TO authenticated, service_role;