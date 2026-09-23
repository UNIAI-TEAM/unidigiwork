ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS is_ai boolean NOT NULL DEFAULT false;