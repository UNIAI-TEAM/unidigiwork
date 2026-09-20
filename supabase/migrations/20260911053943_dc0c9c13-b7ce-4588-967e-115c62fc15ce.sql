create table if not exists public.ceo_report_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_end date not null,
  pdf_path text,
  xlsx_path text,
  notified_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, period_end)
);

create index if not exists ceo_report_runs_tenant_idx on public.ceo_report_runs (tenant_id, period_end desc);

grant select on public.ceo_report_runs to authenticated;
grant all on public.ceo_report_runs to service_role;

alter table public.ceo_report_runs enable row level security;

create policy "ceo_report_runs_admin_read" on public.ceo_report_runs
for select to authenticated
using (exists (
  select 1 from public.tenant_members m
  where m.tenant_id = ceo_report_runs.tenant_id
    and m.user_id = auth.uid()
    and m.status = 'active'
    and m.role in ('tenant_owner','tenant_admin')
));

create policy "ceo_reports_admin_read" on storage.objects
for select to authenticated
using (
  bucket_id = 'ceo-reports'
  and exists (
    select 1 from public.tenant_members m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('tenant_owner','tenant_admin')
      and m.tenant_id::text = split_part(storage.objects.name, '/', 1)
  )
);

select cron.schedule(
  'ceo-weekly-report',
  '0 0 * * 6',
  $$
  select net.http_post(
    url:='https://project--c938c072-6a99-4ce4-bf24-94e5f5e28333.lovable.app/api/public/hooks/ceo-weekly-report',
    headers:='{"Content-Type": "application/json", "x-cron-secret": "fb20fbc8afeebc7e7b0613a07bdf6f7b4cace6b36d09a0eb"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);