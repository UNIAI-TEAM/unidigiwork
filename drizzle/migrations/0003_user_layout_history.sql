create table if not exists public.user_layout_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  tenant_id uuid,
  scope text not null check (scope in ('home','dashboard')),
  prefs jsonb not null,
  label text,
  created_at timestamptz not null default now()
);

grant select, insert, delete on public.user_layout_history to authenticated;
grant all on public.user_layout_history to service_role;

alter table public.user_layout_history enable row level security;

create policy "own layout history select" on public.user_layout_history
  for select to authenticated using (user_id = auth.uid());
create policy "own layout history insert" on public.user_layout_history
  for insert to authenticated with check (user_id = auth.uid());
create policy "own layout history delete" on public.user_layout_history
  for delete to authenticated using (user_id = auth.uid());

create index if not exists user_layout_history_user_scope_idx
  on public.user_layout_history (user_id, scope, created_at desc);