DROP POLICY IF EXISTS "email_threads_participant_select" ON public.email_threads;
CREATE POLICY "email_threads_participant_select"
ON public.email_threads FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.email_messages m
    WHERE m.thread_id = email_threads.id
      AND (
        auth.uid() = m.from_user_id
        OR auth.uid() = ANY (m.to_user_ids)
        OR auth.uid() = ANY (m.cc_user_ids)
      )
  )
);

CREATE POLICY "email_threads_tenant_insert"
ON public.email_threads FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member(tenant_id) AND created_by = auth.uid());