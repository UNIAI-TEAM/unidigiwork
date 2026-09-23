create or replace function public.soft_delete_chat_channel(_channel_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_is_general boolean;
begin
  if not public.is_chat_channel_admin(_channel_id, auth.uid()) then
    raise exception 'PERMISSION_DENIED';
  end if;
  select is_general into v_is_general from public.chat_channels where id = _channel_id and deleted_at is null;
  if v_is_general is null then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;
  if v_is_general then
    raise exception 'PERMISSION_DENIED';
  end if;
  update public.chat_channels
     set deleted_at = now(), updated_by = auth.uid()
   where id = _channel_id;
end $$;

revoke all on function public.soft_delete_chat_channel(uuid) from public;
grant execute on function public.soft_delete_chat_channel(uuid) to authenticated;
grant execute on function public.soft_delete_chat_channel(uuid) to service_role;