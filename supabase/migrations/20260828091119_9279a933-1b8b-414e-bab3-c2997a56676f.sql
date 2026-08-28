-- Gate 24 — job nền dùng khoá riêng phía máy chủ thay cho khoá công khai.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'process-outbox-every-minute'),
  command := $cmd$
  select net.http_post(
    url:='https://project--c938c072-6a99-4ce4-bf24-94e5f5e28333.lovable.app/api/public/hooks/process-outbox',
    headers:='{"Content-Type": "application/json", "x-cron-secret": "fb20fbc8afeebc7e7b0613a07bdf6f7b4cace6b36d09a0eb"}'::jsonb,
    body:='{"batch": 50}'::jsonb
  );
  $cmd$
);

select cron.alter_job(
  (select jobid from cron.job where jobname = 'livekit-reconcile-2min'),
  command := $cmd$
  select net.http_post(
    url:='https://project--c938c072-6a99-4ce4-bf24-94e5f5e28333.lovable.app/api/public/hooks/livekit-reconcile',
    headers:='{"Content-Type": "application/json", "x-cron-secret": "fb20fbc8afeebc7e7b0613a07bdf6f7b4cace6b36d09a0eb"}'::jsonb,
    body:='{}'::jsonb
  );
  $cmd$
);

select cron.alter_job(
  (select jobid from cron.job where jobname = 'process-quota-exports'),
  command := $cmd$
  SELECT net.http_post(
    url := 'https://project--c938c072-6a99-4ce4-bf24-94e5f5e28333.lovable.app/api/public/hooks/process-quota-exports',
    headers := '{"Content-Type":"application/json","x-cron-secret":"fb20fbc8afeebc7e7b0613a07bdf6f7b4cace6b36d09a0eb"}'::jsonb,
    body := '{}'::jsonb
  );
  $cmd$
);

-- Chặn giả mạo thông báo: người nhận phải là chính mình hoặc đồng nghiệp cùng workspace.
DROP POLICY IF EXISTS "Members insert workspace notifications" ON public.notifications;
CREATE POLICY "notifications_insert_scoped"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR (
    workspace_id IS NOT NULL
    AND public.is_workspace_member(workspace_id, auth.uid())
    AND public.is_workspace_member(workspace_id, user_id)
  )
);