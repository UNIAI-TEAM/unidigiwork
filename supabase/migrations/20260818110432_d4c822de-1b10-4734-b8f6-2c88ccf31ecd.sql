-- Restrict email visibility to participants only
DROP POLICY IF EXISTS "email_messages_tenant_select" ON public.email_messages;
DROP POLICY IF EXISTS "email_messages_tenant_write" ON public.email_messages;

CREATE POLICY "email_messages_participant_select"
ON public.email_messages FOR SELECT TO authenticated
USING (
  auth.uid() = from_user_id
  OR auth.uid() = ANY (to_user_ids)
  OR auth.uid() = ANY (cc_user_ids)
  OR EXISTS (
    SELECT 1 FROM public.email_states s
    WHERE s.message_id = email_messages.id AND s.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "email_threads_tenant_select" ON public.email_threads;
DROP POLICY IF EXISTS "email_threads_tenant_write" ON public.email_threads;
DROP POLICY IF EXISTS "Members view threads" ON public.email_threads;

CREATE POLICY "email_threads_participant_select"
ON public.email_threads FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.email_messages m
    WHERE m.thread_id = email_threads.id
      AND (
        auth.uid() = m.from_user_id
        OR auth.uid() = ANY (m.to_user_ids)
        OR auth.uid() = ANY (m.cc_user_ids)
      )
  )
);

CREATE POLICY "email_threads_participant_update"
ON public.email_threads FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.email_messages m
    WHERE m.thread_id = email_threads.id AND auth.uid() = m.from_user_id
  )
)
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));