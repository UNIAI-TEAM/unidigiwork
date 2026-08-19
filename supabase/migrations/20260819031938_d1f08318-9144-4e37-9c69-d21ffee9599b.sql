create or replace function public.can_access_document(_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.documents d
    where d.id = _document_id
      and (
        public.is_workspace_member(d.workspace_id, auth.uid())
        or d.created_by = auth.uid()
        or exists (
          select 1 from public.document_permissions p
          where p.document_id = d.id
            and (
              (p.principal_type = 'user' and p.principal_id = auth.uid())
              or (p.principal_type = 'workspace' and public.is_workspace_member(p.principal_id, auth.uid()))
            )
        )
      )
  );
$$;

grant execute on function public.can_access_document(uuid) to authenticated;

drop policy if exists "documents_tenant_select" on public.documents;
drop policy if exists "Members can view documents" on public.documents;

create policy "documents_member_select" on public.documents
for select to authenticated
using (
  public.is_tenant_member(tenant_id)
  and (
    public.is_workspace_member(workspace_id, auth.uid())
    or created_by = auth.uid()
    or exists (
      select 1 from public.document_permissions p
      where p.document_id = documents.id
        and (
          (p.principal_type = 'user' and p.principal_id = auth.uid())
          or (p.principal_type = 'workspace' and public.is_workspace_member(p.principal_id, auth.uid()))
        )
    )
  )
);

drop policy if exists "document_versions_tenant_select" on public.document_versions;
drop policy if exists "document_versions_tenant_insert" on public.document_versions;

create policy "document_versions_member_select" on public.document_versions
for select to authenticated
using (public.can_access_document(document_id));

create policy "document_versions_member_insert" on public.document_versions
for insert to authenticated
with check (public.is_tenant_member(tenant_id) and public.can_access_document(document_id));

drop policy if exists "document_permissions_tenant_all" on public.document_permissions;

create policy "document_permissions_member_select" on public.document_permissions
for select to authenticated
using (
  (principal_type = 'user' and principal_id = auth.uid())
  or public.can_access_document(document_id)
);

create policy "document_permissions_member_write" on public.document_permissions
for all to authenticated
using (public.is_tenant_member(tenant_id) and public.can_access_document(document_id))
with check (public.is_tenant_member(tenant_id) and public.can_access_document(document_id));