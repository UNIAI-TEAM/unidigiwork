DROP POLICY IF EXISTS "email_messages_participant_select" ON public.email_messages;
CREATE POLICY "email_messages_participant_select"
ON public.email_messages FOR SELECT TO authenticated
USING (
  auth.uid() = from_user_id
  OR auth.uid() = ANY (to_user_ids)
  OR auth.uid() = ANY (cc_user_ids)
);