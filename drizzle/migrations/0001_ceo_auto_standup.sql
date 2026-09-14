alter table public.ceo_kpi_settings
  add column if not exists auto_standup boolean not null default true,
  add column if not exists auto_standup_at timestamptz,
  add column if not exists standup_snapshot jsonb;