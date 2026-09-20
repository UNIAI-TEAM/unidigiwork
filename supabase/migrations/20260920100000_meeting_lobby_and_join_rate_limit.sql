-- ADR-1E-001 — vá hai lỗ hổng chính sách ở cửa vào phòng họp.
--
-- 1. LOBBY. `issue_meeting_join_token` cũ: ai là thành viên tenant mà chưa có
--    trong `meeting_participants` thì được **tự động thêm vào** rồi cấp token.
--    Nghĩa là không tồn tại cuộc họp riêng tư trong nội bộ tenant, và luồng
--    join-request chỉ chặn được người ngoài tenant. Thêm `meetings.access_policy`
--    để chủ toạ tự chọn. Mặc định 'tenant_open' = giữ nguyên hành vi cũ, không
--    phá cuộc họp nào đang chạy.
--
-- 2. RATE LIMIT. Mỗi lần xin token là một row `meeting_join_tokens` + một outbox
--    event + một lần check quota. Trước đây không có trần nào, một client lặp
--    vô hạn là bơm rác không giới hạn (LIVEKIT_CAPACITY_PLAN.md, nghẽn số 1).

-- ---------------------------------------------------------------- 1. Lobby --

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS access_policy text NOT NULL DEFAULT 'tenant_open';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meetings_access_policy_chk') THEN
    ALTER TABLE public.meetings
      ADD CONSTRAINT meetings_access_policy_chk
      CHECK (access_policy IN ('tenant_open', 'invite_only'));
  END IF;
END $$;

COMMENT ON COLUMN public.meetings.access_policy IS
  'tenant_open: mọi thành viên tenant tự vào được. invite_only: chỉ người đã có trong meeting_participants (mời trực tiếp, link mời, hoặc join-request được duyệt).';

-- ----------------------------------------------------------- 2. Rate limit --

-- Rate limit đọc theo (user, meeting, issued_at); index cũ chỉ có (meeting, issued_at).
CREATE INDEX IF NOT EXISTS meeting_join_tokens_user_recent_idx
  ON public.meeting_join_tokens (user_id, meeting_id, issued_at DESC);

-- --------------------------------------------- 3. Cấp token: gate đầy đủ --

CREATE OR REPLACE FUNCTION public.issue_meeting_join_token(
  _meeting_id uuid,
  _token_fingerprint text,
  _expires_at timestamptz,
  _idempotency_key text DEFAULT NULL,
  _correlation_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Vào phòng + tối đa 5 lần tự vào lại (backoff 1/2/4/8/15s) nằm gọn trong
  -- ~30s, nên 10 vé/phút cho một người ở một phòng là rộng rãi với người dùng
  -- thật nhưng chặn đứng client lặp vô hạn.
  _rate_window   CONSTANT interval := interval '60 seconds';
  _rate_max      CONSTANT int := 10;
  _actor   UUID := auth.uid();
  _m       public.meetings;
  _role    TEXT;
  _recent  INT;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;

  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;

  -- Chặn sớm, trước cả khi chạm tới quota/outbox: một client lặp không được
  -- phép làm gì tốn kém hơn một lần SELECT.
  SELECT count(*) INTO _recent
    FROM public.meeting_join_tokens
   WHERE user_id = _actor
     AND meeting_id = _meeting_id
     AND issued_at > now() - _rate_window;
  IF _recent >= _rate_max THEN
    RAISE EXCEPTION 'RATE_LIMITED: meeting join token' USING ERRCODE='53400';
  END IF;

  SELECT mp.role INTO _role FROM public.meeting_participants mp
   WHERE mp.meeting_id = _meeting_id AND mp.user_id = _actor;

  IF _role IS NULL AND NOT public.is_tenant_member(_m.tenant_id) THEN
    RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  -- Phòng kín: là thành viên tenant vẫn chưa đủ, phải được mời/duyệt trước.
  IF _role IS NULL AND _m.access_policy = 'invite_only' THEN
    RAISE EXCEPTION 'MEETING_ACCESS_DENIED: invite_only' USING ERRCODE='42501';
  END IF;

  IF _role IS NULL THEN
    INSERT INTO public.meeting_participants(meeting_id, user_id, tenant_id, role, rsvp, rsvp_at)
    VALUES (_meeting_id, _actor, _m.tenant_id, 'participant', 'accepted', now())
    ON CONFLICT (meeting_id, user_id) DO NOTHING;
    _role := 'participant';
  END IF;

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
    'access_policy', _m.access_policy,
    'expires_at', _expires_at
  );
END;
$$;

-- ------------------------------------------- 4. Đổi chính sách vào phòng --

CREATE OR REPLACE FUNCTION public.set_meeting_access_policy(
  _meeting_id uuid,
  _access_policy text,
  _expected_row_version bigint DEFAULT NULL,
  _idempotency_key text DEFAULT NULL,
  _correlation_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor UUID := auth.uid();
  _m     public.meetings;
  _role  TEXT;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  IF _access_policy NOT IN ('tenant_open', 'invite_only') THEN
    RAISE EXCEPTION 'VALIDATION_FAILED: access_policy' USING ERRCODE='22023';
  END IF;

  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;

  SELECT mp.role INTO _role FROM public.meeting_participants mp
   WHERE mp.meeting_id = _meeting_id AND mp.user_id = _actor;

  -- Chỉ chủ toạ/điều phối, hoặc người tạo cuộc họp, mới được khoá/mở phòng.
  IF COALESCE(_role, '') NOT IN ('host', 'moderator') AND _m.created_by IS DISTINCT FROM _actor THEN
    RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  IF _expected_row_version IS NOT NULL AND _m.row_version <> _expected_row_version THEN
    RAISE EXCEPTION 'MEETING_VERSION_CONFLICT' USING ERRCODE='40001';
  END IF;

  UPDATE public.meetings
     SET access_policy = _access_policy, updated_by = _actor
   WHERE id = _meeting_id
   RETURNING * INTO _m;

  PERFORM public._emit_outbox_event(_m.tenant_id, 'meeting.access_policy.changed', 'meeting', _meeting_id::text,
    jsonb_build_object('meeting_id', _meeting_id, 'actor_id', _actor,
                       'access_policy', _access_policy, 'row_version', _m.row_version),
    _idempotency_key, _correlation_id);

  RETURN jsonb_build_object(
    'meeting_id', _m.id,
    'access_policy', _m.access_policy,
    'row_version', _m.row_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_meeting_access_policy(uuid, text, bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_meeting_access_policy(uuid, text, bigint, text, text) TO authenticated;

-- ------------------------------------------------ 5. Đọc chính sách hiện tại --

CREATE OR REPLACE FUNCTION public.get_meeting_access_policy(_meeting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor UUID := auth.uid();
  _m     public.meetings;
  _role  TEXT;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;

  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;

  SELECT mp.role INTO _role FROM public.meeting_participants mp
   WHERE mp.meeting_id = _meeting_id AND mp.user_id = _actor;

  IF _role IS NULL AND NOT public.is_tenant_member(_m.tenant_id) THEN
    RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  RETURN jsonb_build_object(
    'meeting_id', _m.id,
    'access_policy', _m.access_policy,
    'row_version', _m.row_version,
    'can_manage', (COALESCE(_role, '') IN ('host', 'moderator') OR _m.created_by = _actor)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_meeting_access_policy(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_meeting_access_policy(uuid) TO authenticated;
