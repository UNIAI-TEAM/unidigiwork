CREATE TABLE public.meeting_invite_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  label text,
  expires_at timestamptz,
  max_uses integer,
  used_count integer NOT NULL DEFAULT 0,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_meeting_invite_links_meeting ON public.meeting_invite_links(meeting_id);

GRANT SELECT ON public.meeting_invite_links TO authenticated;
GRANT ALL ON public.meeting_invite_links TO service_role;

ALTER TABLE public.meeting_invite_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invite_links_select_host" ON public.meeting_invite_links
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.meeting_participants mp
     WHERE mp.meeting_id = meeting_invite_links.meeting_id
       AND mp.user_id = auth.uid()
       AND mp.role IN ('host','cohost')
  )
  OR public.has_tenant_role(tenant_id, 'tenant_admin')
  OR public.has_tenant_role(tenant_id, 'tenant_owner')
);

CREATE TRIGGER trg_meeting_invite_links_updated_at
BEFORE UPDATE ON public.meeting_invite_links
FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

CREATE OR REPLACE FUNCTION public.create_meeting_invite_link(
  _meeting_id uuid,
  _expires_in_minutes integer DEFAULT NULL,
  _max_uses integer DEFAULT NULL,
  _label text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _m public.meetings;
  _role text;
  _token text;
  _row public.meeting_invite_links;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;

  SELECT mp.role INTO _role FROM public.meeting_participants mp
   WHERE mp.meeting_id = _meeting_id AND mp.user_id = _actor;

  IF COALESCE(_role,'') NOT IN ('host','cohost')
     AND NOT public.has_tenant_role(_m.tenant_id, 'tenant_admin')
     AND NOT public.has_tenant_role(_m.tenant_id, 'tenant_owner') THEN
    RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  IF _max_uses IS NOT NULL AND _max_uses < 1 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: max_uses' USING ERRCODE='22023';
  END IF;
  IF _expires_in_minutes IS NOT NULL AND _expires_in_minutes < 1 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: expires_in_minutes' USING ERRCODE='22023';
  END IF;

  _token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');

  INSERT INTO public.meeting_invite_links(
    tenant_id, meeting_id, token_hash, label, expires_at, max_uses, created_by)
  VALUES (
    _m.tenant_id, _meeting_id, encode(digest(_token,'sha256'),'hex'), _label,
    CASE WHEN _expires_in_minutes IS NULL THEN NULL ELSE now() + make_interval(mins => _expires_in_minutes) END,
    _max_uses, _actor)
  RETURNING * INTO _row;

  RETURN jsonb_build_object(
    'id', _row.id, 'token', _token, 'meeting_id', _meeting_id,
    'expires_at', _row.expires_at, 'max_uses', _row.max_uses, 'used_count', _row.used_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_meeting_invite_link(
  _token text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _link public.meeting_invite_links;
  _m public.meetings;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;

  SELECT * INTO _link FROM public.meeting_invite_links
   WHERE token_hash = encode(digest(_token,'sha256'),'hex')
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;

  IF _link.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('status','revoked', 'meeting_id', _link.meeting_id);
  END IF;
  IF _link.expires_at IS NOT NULL AND _link.expires_at < now() THEN
    RETURN jsonb_build_object('status','expired', 'meeting_id', _link.meeting_id);
  END IF;

  SELECT * INTO _m FROM public.meetings WHERE id = _link.meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','invalid'); END IF;

  IF EXISTS (SELECT 1 FROM public.meeting_participants mp
              WHERE mp.meeting_id = _link.meeting_id AND mp.user_id = _actor) THEN
    RETURN jsonb_build_object('status','already', 'meeting_id', _link.meeting_id);
  END IF;

  IF _link.max_uses IS NOT NULL AND _link.used_count >= _link.max_uses THEN
    RETURN jsonb_build_object('status','exhausted', 'meeting_id', _link.meeting_id);
  END IF;

  INSERT INTO public.meeting_participants(meeting_id, user_id, tenant_id, role, rsvp, rsvp_at)
  VALUES (_link.meeting_id, _actor, _link.tenant_id, 'participant', 'accepted', now())
  ON CONFLICT (meeting_id, user_id) DO NOTHING;

  UPDATE public.meeting_invite_links
     SET used_count = used_count + 1, updated_at = now()
   WHERE id = _link.id;

  RETURN jsonb_build_object('status','joined', 'meeting_id', _link.meeting_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_meeting_invite_link(uuid, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_meeting_invite_link(uuid, integer, integer, text) TO authenticated;
REVOKE ALL ON FUNCTION public.redeem_meeting_invite_link(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_meeting_invite_link(text) TO authenticated;