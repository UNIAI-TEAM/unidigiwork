-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,                    -- recipient (auth.users.id)
  workspace_id uuid,                        -- optional workspace scope
  type text NOT NULL,                       -- 'comment' | 'mention' | 'meeting' | 'deadline' | 'system' | 'email'
  title text NOT NULL,
  body text,
  link text,                                -- in-app route to open
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_created_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx  ON public.notifications (user_id) WHERE is_read = false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications"   ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own notifications" ON public.notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Members insert workspace notifications" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (workspace_id IS NULL OR public.is_workspace_member(workspace_id, auth.uid()));

-- ============ EMAIL ============
CREATE TABLE public.email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  subject text NOT NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_threads_workspace_idx ON public.email_threads (workspace_id, last_message_at DESC);

CREATE TABLE public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  from_user_id uuid NOT NULL,
  to_user_ids uuid[] NOT NULL DEFAULT '{}',
  cc_user_ids uuid[] NOT NULL DEFAULT '{}',
  subject text NOT NULL,
  body text NOT NULL DEFAULT '',
  is_draft boolean NOT NULL DEFAULT false,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_messages_thread_idx    ON public.email_messages (thread_id, created_at);
CREATE INDEX email_messages_workspace_idx ON public.email_messages (workspace_id, sent_at DESC);

-- Per-user mailbox state: one row per (message, user) — inbox for recipients, sent for sender, drafts for author.
CREATE TABLE public.email_states (
  message_id uuid NOT NULL REFERENCES public.email_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  folder text NOT NULL DEFAULT 'inbox',    -- 'inbox' | 'sent' | 'drafts' | 'archive' | 'trash' | 'starred'
  is_read boolean NOT NULL DEFAULT false,
  is_starred boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX email_states_user_folder_idx ON public.email_states (user_id, folder, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_threads  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_states   TO authenticated;
GRANT ALL ON public.email_threads, public.email_messages, public.email_states TO service_role;

ALTER TABLE public.email_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_states   ENABLE ROW LEVEL SECURITY;

-- Threads: workspace members can see + create
CREATE POLICY "Members view threads"   ON public.email_threads FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members insert threads" ON public.email_threads FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members update threads" ON public.email_threads FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- Messages: user can see if participant (sender, to, cc) OR has a state row (covers archive/drafts)
CREATE POLICY "Participants view messages" ON public.email_messages FOR SELECT TO authenticated
  USING (
    auth.uid() = from_user_id
    OR auth.uid() = ANY(to_user_ids)
    OR auth.uid() = ANY(cc_user_ids)
  );
CREATE POLICY "Members insert messages" ON public.email_messages FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND auth.uid() = from_user_id);
CREATE POLICY "Sender updates own drafts" ON public.email_messages FOR UPDATE TO authenticated
  USING (auth.uid() = from_user_id AND is_draft = true) WITH CHECK (auth.uid() = from_user_id);
CREATE POLICY "Sender deletes own drafts" ON public.email_messages FOR DELETE TO authenticated
  USING (auth.uid() = from_user_id AND is_draft = true);

-- States: user manages only their own mailbox row
CREATE POLICY "Users view own state"   ON public.email_states FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own state" ON public.email_states FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own state" ON public.email_states FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own state" ON public.email_states FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Trigger: bump thread.last_message_at khi có message mới (chỉ khi đã sent)
CREATE OR REPLACE FUNCTION public.bump_email_thread()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.sent_at IS NOT NULL THEN
    UPDATE public.email_threads SET last_message_at = NEW.sent_at WHERE id = NEW.thread_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_bump_email_thread
AFTER INSERT OR UPDATE OF sent_at ON public.email_messages
FOR EACH ROW EXECUTE FUNCTION public.bump_email_thread();

-- updated_at trigger cho email_states
CREATE TRIGGER trg_email_states_updated
BEFORE UPDATE ON public.email_states
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();