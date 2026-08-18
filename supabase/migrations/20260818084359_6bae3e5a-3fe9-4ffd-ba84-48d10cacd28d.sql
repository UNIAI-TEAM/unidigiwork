insert into public.tenant_members (tenant_id, user_id, role, status)
values ('64028bca-b1ad-4870-8607-ecdf5f4663a9','74dc2daa-ee6e-45a6-a847-c9baf2465a18','member','active')
on conflict do nothing;

insert into public.workspace_members (workspace_id, user_id, role)
values ('64028bca-b1ad-4870-8607-ecdf5f4663a9','74dc2daa-ee6e-45a6-a847-c9baf2465a18','member')
on conflict do nothing;