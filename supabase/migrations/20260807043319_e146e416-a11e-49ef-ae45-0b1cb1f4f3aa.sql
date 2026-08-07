
CREATE POLICY "task_attachments_read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'task-attachments' AND public.is_workspace_member((storage.foldername(name))[1]::uuid, auth.uid()));

CREATE POLICY "task_attachments_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'task-attachments' AND public.is_workspace_member((storage.foldername(name))[1]::uuid, auth.uid()));

CREATE POLICY "task_attachments_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'task-attachments' AND public.is_workspace_member((storage.foldername(name))[1]::uuid, auth.uid()));
