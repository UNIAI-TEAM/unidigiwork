DROP POLICY IF EXISTS email_attachments_obj_insert ON storage.objects;
CREATE POLICY email_attachments_obj_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'email-attachments' AND owner = auth.uid());

DROP POLICY IF EXISTS email_attachments_obj_select ON storage.objects;
CREATE POLICY email_attachments_obj_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'email-attachments'
    AND (
      owner = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.email_attachments a
        JOIN public.email_states es ON es.message_id = a.message_id
        WHERE a.object_key = storage.objects.name AND es.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS email_attachments_obj_delete ON storage.objects;
CREATE POLICY email_attachments_obj_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'email-attachments' AND owner = auth.uid());