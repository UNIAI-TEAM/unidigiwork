select cron.unschedule('ai-brain-daily') where exists (select 1 from cron.job where jobname='ai-brain-daily');
select cron.schedule(
  'ai-brain-daily',
  '0 22 * * *',
  $$
  select net.http_post(
    url:='https://project--c938c072-6a99-4ce4-bf24-94e5f5e28333.lovable.app/api/public/hooks/ai-brain-daily',
    headers:='{"Content-Type": "application/json", "x-cron-secret": "fb20fbc8afeebc7e7b0613a07bdf6f7b4cace6b36d09a0eb"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);