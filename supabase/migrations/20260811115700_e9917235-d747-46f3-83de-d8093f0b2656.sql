CREATE POLICY "chat_attachments_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND public.is_chat_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "chat_attachments_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND owner = auth.uid()
    AND public.is_chat_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "chat_attachments_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (
      owner = auth.uid()
      OR public.is_chat_channel_admin(((storage.foldername(name))[1])::uuid, auth.uid())
    )
  );