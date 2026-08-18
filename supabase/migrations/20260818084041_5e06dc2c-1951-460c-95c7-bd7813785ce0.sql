create or replace function public.fanout_email_inbox_states(p_message_id uuid, p_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_from uuid;
  v_count integer := 0;
begin
  select m.tenant_id, m.from_user_id into v_tenant, v_from
  from public.email_messages m where m.id = p_message_id;
  if v_from is null or v_from <> auth.uid() then
    raise exception 'NOT_MESSAGE_SENDER';
  end if;

  insert into public.email_states (user_id, message_id, tenant_id, folder, is_read)
  select u, p_message_id, v_tenant, 'inbox', false
  from unnest(p_user_ids) as u
  where u <> v_from
    and exists (
      select 1 from public.tenant_members tm
      where tm.user_id = u and tm.tenant_id = v_tenant and tm.status = 'active'
    )
  on conflict (message_id, user_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.fanout_email_inbox_states(uuid, uuid[]) from public;
grant execute on function public.fanout_email_inbox_states(uuid, uuid[]) to authenticated;
grant execute on function public.fanout_email_inbox_states(uuid, uuid[]) to service_role;