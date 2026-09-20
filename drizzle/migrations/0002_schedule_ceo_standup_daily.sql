select cron.unschedule('ceo-standup-daily') where exists (select 1 from cron.job where jobname='ceo-standup-daily');
select cron.schedule(
  'ceo-standup-daily',
  '30 23 * * *',
  $$
  select net.http_post(
    url:='https://project--c938c072-6a99-4ce4-bf24-94e5f5e28333.lovable.app/api/public/hooks/ceo-standup-daily',
    headers:='{"Content-Type": "application/json", "x-cron-secret": "fb20fbc8afeebc7e7b0613a07bdf6f7b4cace6b36d09a0eb"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);