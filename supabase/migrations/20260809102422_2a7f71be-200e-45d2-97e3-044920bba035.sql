-- ============ CHAT: channels / members / messages ============

CREATE TABLE public.chat_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  kind text NOT NULL DEFAULT 'channel',
  is_private boolean NOT NULL DEFAULT false,
  last_message_at timestamptz,
  created_by uuid,
  updated_by uuid,
  row_version bigint NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_channels_kind_chk CHECK (kind IN ('channel','dm')),
  CONSTRAINT chat_channels_name_chk CHECK (char_length(name) BETWEEN 1 AND 80)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_channels TO authenticated;
GRANT ALL ON public.chat_channels TO service_role;

CREATE TABLE public.chat_members (
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  is_favorite boolean NOT NULL DEFAULT false,
  last_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id),
  CONSTRAINT chat_members_role_chk CHECK (role IN ('owner','member'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_members TO authenticated;
GRANT ALL ON public.chat_members TO service_role;

CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  parent_message_id uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  edited_at timestamptz,
  deleted_at timestamptz,
  row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_body_chk CHECK (char_length(body) BETWEEN 1 AND 8000)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;

-- Indexes
CREATE UNIQUE INDEX chat_channels_unique_name
  ON public.chat_channels (tenant_id, workspace_id, lower(name))
  WHERE kind = 'channel' AND deleted_at IS NULL;
CREATE INDEX chat_channels_workspace_idx ON public.chat_channels (workspace_id, last_message_at DESC NULLS LAST);
CREATE INDEX chat_members_user_idx ON public.chat_members (user_id);
CREATE INDEX chat_messages_channel_idx ON public.chat_messages (channel_id, created_at DESC);
CREATE INDEX chat_messages_parent_idx ON public.chat_messages (parent_message_id);
CREATE INDEX chat_messages_body_trgm ON public.chat_messages USING gin (body gin_trgm_ops);

-- Security definer helpers (avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.is_chat_member(_channel_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_members m
    WHERE m.channel_id = _channel_id AND m.user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_chat_channel_admin(_channel_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_members m
    WHERE m.channel_id = _channel_id AND m.user_id = _user_id AND m.role = 'owner'
  ) OR EXISTS (
    SELECT 1
    FROM public.chat_channels c
    JOIN public.tenant_members tm
      ON tm.tenant_id = c.tenant_id
     AND tm.user_id = _user_id
     AND tm.status = 'active'
     AND tm.role IN ('tenant_owner','tenant_admin')
    WHERE c.id = _channel_id
  )
$$;

CREATE OR REPLACE FUNCTION public.can_view_chat_channel(_channel_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_channels c
    WHERE c.id = _channel_id
      AND c.deleted_at IS NULL
      AND (
        public.is_chat_member(c.id, _user_id)
        OR (
          c.is_private = false
          AND c.kind = 'channel'
          AND EXISTS (
            SELECT 1 FROM public.tenant_members tm
            WHERE tm.tenant_id = c.tenant_id
              AND tm.user_id = _user_id
              AND tm.status = 'active'
          )
        )
      )
  )
$$;

-- RLS: chat_channels
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_channels_select" ON public.chat_channels
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.is_chat_member(id, auth.uid())
      OR (
        is_private = false
        AND kind = 'channel'
        AND public.is_tenant_member(tenant_id)
      )
    )
  );

CREATE POLICY "chat_channels_insert" ON public.chat_channels
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_tenant_member(tenant_id)
  );

CREATE POLICY "chat_channels_update" ON public.chat_channels
  FOR UPDATE TO authenticated
  USING (public.is_chat_channel_admin(id, auth.uid()))
  WITH CHECK (public.is_chat_channel_admin(id, auth.uid()));

CREATE POLICY "chat_channels_delete" ON public.chat_channels
  FOR DELETE TO authenticated
  USING (public.is_chat_channel_admin(id, auth.uid()));

-- RLS: chat_members
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_members_select" ON public.chat_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_chat_member(channel_id, auth.uid()));

CREATE POLICY "chat_members_insert" ON public.chat_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_chat_channel_admin(channel_id, auth.uid())
    OR (user_id = auth.uid() AND public.can_view_chat_channel(channel_id, auth.uid()))
  );

CREATE POLICY "chat_members_update" ON public.chat_members
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_chat_channel_admin(channel_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_chat_channel_admin(channel_id, auth.uid()));

CREATE POLICY "chat_members_delete" ON public.chat_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_chat_channel_admin(channel_id, auth.uid()));

-- RLS: chat_messages
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_messages_select" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.is_chat_member(channel_id, auth.uid()));

CREATE POLICY "chat_messages_insert" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.is_chat_member(channel_id, auth.uid()));

CREATE POLICY "chat_messages_update" ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.is_chat_channel_admin(channel_id, auth.uid()))
  WITH CHECK (author_id = auth.uid() OR public.is_chat_channel_admin(channel_id, auth.uid()));

CREATE POLICY "chat_messages_delete" ON public.chat_messages
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_chat_channel_admin(channel_id, auth.uid()));

-- Triggers: updated_at + row_version + last_message_at
CREATE TRIGGER chat_channels_set_updated_at
  BEFORE UPDATE ON public.chat_channels
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

CREATE TRIGGER chat_messages_set_updated_at
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

CREATE OR REPLACE FUNCTION public.chat_members_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER chat_members_set_updated_at
  BEFORE UPDATE ON public.chat_members
  FOR EACH ROW EXECUTE FUNCTION public.chat_members_touch_updated_at();

CREATE OR REPLACE FUNCTION public.bump_chat_channel_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.chat_channels
     SET last_message_at = NEW.created_at
   WHERE id = NEW.channel_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER chat_messages_bump_channel
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_chat_channel_activity();

-- Realtime
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;