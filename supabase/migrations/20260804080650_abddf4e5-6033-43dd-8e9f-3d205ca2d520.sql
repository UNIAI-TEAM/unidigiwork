-- ============================ Batch LK-DB ============================
-- ADR-1E-001 — LiveKit conferencing foundation

-- 1. meeting_join_tokens (audit-only, tenant-scoped)
CREATE TABLE IF NOT EXISTS public.meeting_join_tokens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  meeting_id        UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('host','moderator','participant','viewer')),
  token_fingerprint TEXT NOT NULL,
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL,
  correlation_id    TEXT,
  idempotency_key   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meeting_join_tokens_meeting_idx ON public.meeting_join_tokens(meeting_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS meeting_join_tokens_tenant_idx  ON public.meeting_join_tokens(tenant_id, issued_at DESC);

GRANT SELECT ON public.meeting_join_tokens TO authenticated;
GRANT ALL    ON public.meeting_join_tokens TO service_role;
ALTER TABLE public.meeting_join_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_join_tokens_read ON public.meeting_join_tokens;
CREATE POLICY meeting_join_tokens_read ON public.meeting_join_tokens FOR SELECT TO authenticated
  USING (
    public.is_tenant_member(tenant_id)
    AND EXISTS (
      SELECT 1 FROM public.meeting_participants mp
      WHERE mp.meeting_id = meeting_join_tokens.meeting_id
        AND mp.user_id = auth.uid()
        AND mp.tenant_id = meeting_join_tokens.tenant_id
    )
  );

-- 2. Entitlement catalog
INSERT INTO public.features(key, name, kind, unit, category, sort_order) VALUES
  ('meetings.conference',           'Hội nghị trực tuyến',         'flag',  NULL,      'meeting', 42),
  ('meeting_participant_minutes',   'Phút × người tham gia / kỳ',  'quota', 'minutes', 'meeting', 43)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.plan_features(plan_id, feature_key, enabled, quota_limit)
SELECT p.id, v.feature_key, v.enabled, v.quota_limit
FROM public.plans p, (VALUES
  ('free',     'meetings.conference',         TRUE, NULL::BIGINT),
  ('free',     'meeting_participant_minutes', TRUE, 500::BIGINT),
  ('pro',      'meetings.conference',         TRUE, NULL::BIGINT),
  ('pro',      'meeting_participant_minutes', TRUE, 5000::BIGINT),
  ('business', 'meetings.conference',         TRUE, NULL::BIGINT),
  ('business', 'meeting_participant_minutes', TRUE, NULL::BIGINT)
) AS v(plan_code, feature_key, enabled, quota_limit)
WHERE p.code = v.plan_code
ON CONFLICT (plan_id, feature_key) DO NOTHING;

DO $$ DECLARE _t UUID; BEGIN
  FOR _t IN SELECT id FROM public.tenants LOOP
    PERFORM public.refresh_entitlements(_t);
  END LOOP;
END $$;

-- 3. issue_meeting_join_token
CREATE OR REPLACE FUNCTION public.issue_meeting_join_token(
  _meeting_id UUID,
  _token_fingerprint TEXT,
  _expires_at TIMESTAMPTZ,
  _idempotency_key TEXT DEFAULT NULL,
  _correlation_id TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor UUID := auth.uid();
  _m public.meetings;
  _role TEXT;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;

  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;
  IF NOT public.is_tenant_member(_m.tenant_id) THEN
    RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  SELECT mp.role INTO _role FROM public.meeting_participants mp
   WHERE mp.meeting_id = _meeting_id AND mp.user_id = _actor;
  IF _role IS NULL THEN RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501'; END IF;

  IF _m.status NOT IN ('scheduled','live') THEN
    RAISE EXCEPTION 'MEETING_NOT_JOINABLE' USING ERRCODE='55000';
  END IF;

  IF NOT public.check_quota(_m.tenant_id, 'meetings.conference', 0) THEN
    RAISE EXCEPTION 'ENTITLEMENT_DENIED: meetings.conference' USING ERRCODE='42501';
  END IF;
  IF NOT public.check_quota(_m.tenant_id, 'meeting_participant_minutes', 1) THEN
    PERFORM public._raise_quota_exceeded(_m.tenant_id, 'meeting_participant_minutes', 1);
  END IF;

  IF _m.conference_provider IS NULL OR _m.conference_ref IS NULL THEN
    UPDATE public.meetings
       SET conference_provider = COALESCE(conference_provider, 'livekit'),
           conference_ref = COALESCE(conference_ref, jsonb_build_object(
             'provider', 'livekit', 'roomName', 'mtg_' || _meeting_id::text, 'region', NULL)),
           updated_at = now()
     WHERE id = _meeting_id
     RETURNING * INTO _m;
  END IF;

  INSERT INTO public.meeting_join_tokens(
    tenant_id, meeting_id, user_id, role, token_fingerprint, expires_at, correlation_id, idempotency_key)
  VALUES (_m.tenant_id, _meeting_id, _actor, _role, _token_fingerprint, _expires_at, _correlation_id, _idempotency_key);

  PERFORM public._emit_outbox_event(_m.tenant_id, 'meeting.join_token.issued', 'meeting', _meeting_id::text,
    jsonb_build_object('meeting_id', _meeting_id, 'user_id', _actor, 'role', _role, 'expires_at', _expires_at),
    _idempotency_key, _correlation_id);

  RETURN jsonb_build_object(
    'meeting_id', _meeting_id,
    'tenant_id', _m.tenant_id,
    'room_name', COALESCE(_m.conference_ref->>'roomName', 'mtg_' || _meeting_id::text),
    'provider', COALESCE(_m.conference_provider, 'livekit'),
    'role', _role,
    'status', _m.status
  );
END $$;

REVOKE ALL ON FUNCTION public.issue_meeting_join_token(uuid, text, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_meeting_join_token(uuid, text, timestamptz, text, text) TO authenticated, service_role;

-- 4. start_meeting / end_meeting
CREATE OR REPLACE FUNCTION public.start_meeting(
  _meeting_id UUID, _expected_row_version BIGINT DEFAULT NULL,
  _idempotency_key TEXT DEFAULT NULL, _correlation_id TEXT DEFAULT NULL
) RETURNS public.meetings LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor UUID := auth.uid(); _m public.meetings; _role TEXT;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;
  IF NOT public.is_tenant_member(_m.tenant_id) THEN RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  SELECT mp.role INTO _role FROM public.meeting_participants mp
    WHERE mp.meeting_id = _meeting_id AND mp.user_id = _actor;
  IF _role IS NULL OR _role NOT IN ('host','moderator') THEN
    RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  IF _expected_row_version IS NOT NULL AND _m.row_version <> _expected_row_version THEN
    RAISE EXCEPTION 'MEETING_VERSION_CONFLICT' USING ERRCODE='40001';
  END IF;
  IF _m.status = 'live' THEN RETURN _m; END IF;
  IF _m.status <> 'scheduled' THEN RAISE EXCEPTION 'MEETING_NOT_JOINABLE' USING ERRCODE='55000'; END IF;

  UPDATE public.meetings SET status = 'live', updated_by = _actor, updated_at = now()
   WHERE id = _meeting_id RETURNING * INTO _m;
  PERFORM public._emit_outbox_event(_m.tenant_id, 'meeting.meeting.started', 'meeting', _meeting_id::text,
    jsonb_build_object('meeting_id', _meeting_id), _idempotency_key, _correlation_id);
  RETURN _m;
END $$;

REVOKE ALL ON FUNCTION public.start_meeting(uuid, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_meeting(uuid, bigint, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.end_meeting(
  _meeting_id UUID, _expected_row_version BIGINT DEFAULT NULL,
  _idempotency_key TEXT DEFAULT NULL, _correlation_id TEXT DEFAULT NULL
) RETURNS public.meetings LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor UUID := auth.uid(); _m public.meetings; _role TEXT;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;
  IF NOT public.is_tenant_member(_m.tenant_id) THEN RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  SELECT mp.role INTO _role FROM public.meeting_participants mp
    WHERE mp.meeting_id = _meeting_id AND mp.user_id = _actor;
  IF _role IS NULL OR _role NOT IN ('host','moderator') THEN
    RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  IF _expected_row_version IS NOT NULL AND _m.row_version <> _expected_row_version THEN
    RAISE EXCEPTION 'MEETING_VERSION_CONFLICT' USING ERRCODE='40001';
  END IF;
  IF _m.status = 'ended' THEN RETURN _m; END IF;

  UPDATE public.meetings SET status = 'ended', updated_by = _actor, updated_at = now()
   WHERE id = _meeting_id RETURNING * INTO _m;
  PERFORM public._emit_outbox_event(_m.tenant_id, 'meeting.meeting.ended', 'meeting', _meeting_id::text,
    jsonb_build_object('meeting_id', _meeting_id), _idempotency_key, _correlation_id);
  RETURN _m;
END $$;

REVOKE ALL ON FUNCTION public.end_meeting(uuid, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_meeting(uuid, bigint, text, text) TO authenticated, service_role;

-- 5. record_meeting_usage — webhook only (service_role)
CREATE OR REPLACE FUNCTION public.record_meeting_usage(
  _meeting_id UUID, _participant_minutes BIGINT,
  _idempotency_key TEXT, _correlation_id TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.meetings;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;
  IF _participant_minutes IS NULL OR _participant_minutes <= 0 THEN RETURN; END IF;

  PERFORM public.record_usage(_m.tenant_id, 'meeting_participant_minutes', _participant_minutes,
    _idempotency_key, _correlation_id, _m.workspace_id, jsonb_build_object('meeting_id', _meeting_id));
  PERFORM public.record_usage(_m.tenant_id, 'meeting.minutes', _participant_minutes,
    _idempotency_key || ':minutes', _correlation_id, _m.workspace_id, jsonb_build_object('meeting_id', _meeting_id));
END $$;

REVOKE ALL ON FUNCTION public.record_meeting_usage(uuid, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_meeting_usage(uuid, bigint, text, text) TO service_role;

-- 6. finalize_meeting_from_provider — webhook room_finished (service_role)
CREATE OR REPLACE FUNCTION public.finalize_meeting_from_provider(
  _meeting_id UUID, _idempotency_key TEXT, _correlation_id TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _m public.meetings;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF _m.status = 'ended' THEN RETURN; END IF;
  UPDATE public.meetings SET status = 'ended', updated_at = now() WHERE id = _meeting_id;
  PERFORM public._emit_outbox_event(_m.tenant_id, 'meeting.meeting.ended', 'meeting', _meeting_id::text,
    jsonb_build_object('meeting_id', _meeting_id, 'source', 'provider'), _idempotency_key, _correlation_id);
END $$;

REVOKE ALL ON FUNCTION public.finalize_meeting_from_provider(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_meeting_from_provider(uuid, text, text) TO service_role;
