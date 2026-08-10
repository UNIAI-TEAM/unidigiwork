CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Cuộc hội thoại mới',
  model text NOT NULL DEFAULT 'openai/gpt-5.6-sol',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_input_tokens bigint NOT NULL DEFAULT 0,
  total_output_tokens bigint NOT NULL DEFAULT 0,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL DEFAULT '',
  model text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.ai_messages(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  duration_ms integer,
  run_id text,
  status text NOT NULL DEFAULT 'succeeded',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_conversations_ws_idx ON public.ai_conversations (workspace_id, last_message_at DESC);
CREATE INDEX ai_conversations_tenant_idx ON public.ai_conversations (tenant_id, created_by, last_message_at DESC);
CREATE INDEX ai_messages_conv_idx ON public.ai_messages (conversation_id, created_at);
CREATE INDEX ai_usage_ws_idx ON public.ai_usage_events (tenant_id, workspace_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_messages TO authenticated;
GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;
GRANT ALL ON public.ai_messages TO service_role;
GRANT ALL ON public.ai_usage_events TO service_role;

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_conversations_owner_all" ON public.ai_conversations
  FOR ALL TO authenticated
  USING (created_by = auth.uid() AND public.is_tenant_member(tenant_id))
  WITH CHECK (created_by = auth.uid() AND public.is_tenant_member(tenant_id));

CREATE POLICY "ai_messages_owner_all" ON public.ai_messages
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ai_conversations c WHERE c.id = conversation_id AND c.created_by = auth.uid()));

CREATE POLICY "ai_usage_read_own_or_admin" ON public.ai_usage_events
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_tenant_role(tenant_id, 'tenant_owner'::tenant_role)
    OR public.has_tenant_role(tenant_id, 'tenant_admin'::tenant_role)
  );

CREATE TRIGGER ai_conversations_updated_at BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();