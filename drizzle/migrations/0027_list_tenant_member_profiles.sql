create or replace function public.list_tenant_member_profiles(_tenant_id uuid)
returns table (id uuid, display_name text, primary_email text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.display_name, u.primary_email
  from public.tenant_members tm
  join public.users u on u.id = tm.user_id
  where tm.tenant_id = _tenant_id
    and tm.status = 'active'
    and auth.uid() is not null
    and public.is_tenant_member(_tenant_id)
$$;

revoke all on function public.list_tenant_member_profiles(uuid) from public;
grant execute on function public.list_tenant_member_profiles(uuid) to authenticated, service_role;