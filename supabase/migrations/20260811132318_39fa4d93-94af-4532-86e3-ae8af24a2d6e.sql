ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS chat_messages_pinned_idx
  ON public.chat_messages (channel_id, pinned_at DESC)
  WHERE pinned_at IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_chat_message_pin(_message_id uuid, _pinned boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _channel uuid;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT channel_id INTO _channel
  FROM public.chat_messages
  WHERE id = _message_id AND deleted_at IS NULL;

  IF _channel IS NULL THEN
    RAISE EXCEPTION 'RESOURCE_NOT_FOUND';
  END IF;

  IF NOT public.is_chat_member(_channel, _uid) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  UPDATE public.chat_messages
  SET pinned_at = CASE WHEN _pinned THEN now() ELSE NULL END,
      pinned_by = CASE WHEN _pinned THEN _uid ELSE NULL END
  WHERE id = _message_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_chat_message_pin(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_chat_message_pin(uuid, boolean) TO authenticated;