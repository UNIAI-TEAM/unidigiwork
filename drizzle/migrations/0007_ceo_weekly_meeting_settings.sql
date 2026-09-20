alter table public.ceo_kpi_settings
  add column if not exists weekly_meeting_dow smallint not null default 1,
  add column if not exists weekly_meeting_hour_vn smallint not null default 9,
  add column if not exists weekly_meeting_location text not null default 'Phòng họp trực tuyến UniWork',
  add column if not exists weekly_meeting_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ceo_kpi_settings_weekly_dow_chk') then
    alter table public.ceo_kpi_settings
      add constraint ceo_kpi_settings_weekly_dow_chk check (weekly_meeting_dow between 0 and 6);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ceo_kpi_settings_weekly_hour_chk') then
    alter table public.ceo_kpi_settings
      add constraint ceo_kpi_settings_weekly_hour_chk check (weekly_meeting_hour_vn between 0 and 23);
  end if;
end $$;