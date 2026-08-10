-- 1) Soft delete cho ai_conversations
ALTER TABLE public.ai_conversations
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

CREATE INDEX IF NOT EXISTS ai_conversations_deleted_idx
  ON public.ai_conversations (tenant_id, deleted_at);

-- 2) Lịch sử phiên bản tin nhắn
CREATE TABLE IF NOT EXISTS public.ai_message_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.ai_messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  version integer NOT NULL,
  content text NOT NULL,
  edited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, version)
);

CREATE INDEX IF NOT EXISTS ai_message_versions_msg_idx
  ON public.ai_message_versions (message_id, version DESC);

GRANT SELECT ON public.ai_message_versions TO authenticated;
GRANT ALL ON public.ai_message_versions TO service_role;

ALTER TABLE public.ai_message_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_message_versions_read_tenant"
  ON public.ai_message_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ai_conversations c
      WHERE c.id = ai_message_versions.conversation_id
        AND c.created_by = auth.uid()
    )
  );

-- 3) Trigger tự ghi phiên bản khi nội dung tin nhắn đổi
CREATE OR REPLACE FUNCTION public.tg_ai_messages_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
    FROM public.ai_message_versions
    WHERE message_id = OLD.id;

    INSERT INTO public.ai_message_versions (
      tenant_id, message_id, conversation_id, version, content, edited_by
    ) VALUES (
      OLD.tenant_id, OLD.id, OLD.conversation_id, v_next, OLD.content, auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_ai_messages_version ON public.ai_messages;
CREATE TRIGGER tg_ai_messages_version
  BEFORE UPDATE ON public.ai_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_ai_messages_version();