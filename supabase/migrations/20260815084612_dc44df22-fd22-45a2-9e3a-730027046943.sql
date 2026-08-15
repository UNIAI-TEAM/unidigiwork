CREATE INDEX IF NOT EXISTS email_messages_subject_trgm_idx
  ON public.email_messages USING gin (subject gin_trgm_ops);

CREATE INDEX IF NOT EXISTS email_states_user_inbox_unread_idx
  ON public.email_states (user_id, folder, is_read);

CREATE INDEX IF NOT EXISTS meetings_workspace_updated_idx
  ON public.meetings (workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_tenant_occurred_idx
  ON public.audit_events (tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS chat_messages_channel_created_idx
  ON public.chat_messages (channel_id, created_at DESC);