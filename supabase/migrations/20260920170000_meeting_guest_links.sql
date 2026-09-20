-- Khách ngoài vào họp bằng link chia sẻ, không cần tài khoản nền tảng.
--
-- Xem docs/superpowers/specs/2026-09-20-meeting-guest-link-design.md.
--
-- CẢNH BÁO BẢO MẬT: đây là hai RPC đầu tiên của hệ thống cấp EXECUTE cho role
-- `anon`. Trước migration này không một hàm nào mở cho người chưa đăng nhập.
-- Toàn bộ thẩm quyền nằm trong thân hàm; `anon` không được cấp quyền trên bất
-- kỳ bảng nào. Đọc kỹ phần kiểm tra trong `redeem_meeting_guest_link` trước khi
-- sửa bất cứ dòng nào ở đây.

-- ---------------------------------------------------- 1. Cờ trên link mời --

-- Mặc định TẮT là điều kiện bắt buộc: mọi link đã phát đi trước migration này
-- được tạo với hiểu ngầm "chỉ người có tài khoản". Bật mặc định sẽ là một thay
-- đổi quyền truy cập hồi tố trên những URL đang nằm sẵn trong hộp thư người ta.
ALTER TABLE public.meeting_invite_links
  ADD COLUMN IF NOT EXISTS allow_guests boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.meeting_invite_links.allow_guests IS
  'true = người không có tài khoản nền tảng đổi được link này lấy vé vào phòng. Mặc định false.';

-- Vết cấp vé dùng chung một bảng cho cả người nội bộ lẫn khách: user_id không
-- có FK nên chứa được guest_id. Cờ này để người đọc vết phân biệt hai loại.
ALTER TABLE public.meeting_join_tokens
  ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT false;

-- --------------------------------------------------------- 2. Phiên khách --

CREATE TABLE IF NOT EXISTS public.meeting_guests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  meeting_id         uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  invite_link_id     uuid NOT NULL REFERENCES public.meeting_invite_links(id) ON DELETE CASCADE,
  display_name       text NOT NULL,
  -- Không bao giờ lưu token thô, giống cách meeting_invite_links làm.
  session_token_hash text NOT NULL UNIQUE,
  expires_at         timestamptz NOT NULL,
  revoked_at         timestamptz,
  first_joined_at    timestamptz,
  last_seen_at       timestamptz,
  row_version        bigint NOT NULL DEFAULT 1,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_guests_meeting_idx
  ON public.meeting_guests (meeting_id, created_at DESC);
CREATE INDEX IF NOT EXISTS meeting_guests_tenant_idx
  ON public.meeting_guests (tenant_id, created_at DESC);
-- Rate limit đọc theo link trong cửa sổ thời gian ngắn.
CREATE INDEX IF NOT EXISTS meeting_guests_link_recent_idx
  ON public.meeting_guests (invite_link_id, created_at DESC);

ALTER TABLE public.meeting_guests ENABLE ROW LEVEL SECURITY;

-- Chỉ chủ toạ cuộc họp và quản trị tổ chức đọc được danh sách khách. `anon`
-- không có policy nào ở đây và cũng không được GRANT — khách chỉ đi qua RPC.
CREATE POLICY meeting_guests_select_host ON public.meeting_guests
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.meeting_participants mp
     WHERE mp.meeting_id = meeting_guests.meeting_id
       AND mp.user_id = auth.uid()
       AND mp.role IN ('host','moderator')
  )
  OR public.has_tenant_role(tenant_id, 'tenant_admin')
  OR public.has_tenant_role(tenant_id, 'tenant_owner')
);

GRANT SELECT ON public.meeting_guests TO authenticated;
GRANT ALL    ON public.meeting_guests TO service_role;

DROP TRIGGER IF EXISTS trg_meeting_guests_bump ON public.meeting_guests;
CREATE TRIGGER trg_meeting_guests_bump
BEFORE UPDATE ON public.meeting_guests
FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

-- ------------------------------------------ 3. Tạo link: thêm allow_guests --

-- Thêm tham số có DEFAULT sẽ tạo overload thứ hai cùng tên, và lời gọi 4 đối số
-- trở nên nhập nhằng ("function is not unique"). Bỏ hàm cũ rồi tạo lại.
DROP FUNCTION IF EXISTS public.create_meeting_invite_link(uuid, integer, integer, text);

CREATE OR REPLACE FUNCTION public.create_meeting_invite_link(
  _meeting_id uuid,
  _expires_in_minutes integer DEFAULT NULL,
  _max_uses integer DEFAULT NULL,
  _label text DEFAULT NULL,
  _allow_guests boolean DEFAULT false
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
    tenant_id, meeting_id, token_hash, label, expires_at, max_uses, created_by, allow_guests)
  VALUES (
    _m.tenant_id, _meeting_id, encode(digest(_token,'sha256'),'hex'), _label,
    CASE WHEN _expires_in_minutes IS NULL THEN NULL ELSE now() + make_interval(mins => _expires_in_minutes) END,
    _max_uses, _actor, COALESCE(_allow_guests, false))
  RETURNING * INTO _row;

  RETURN jsonb_build_object(
    'id', _row.id, 'token', _token, 'meeting_id', _meeting_id,
    'expires_at', _row.expires_at, 'max_uses', _row.max_uses,
    'used_count', _row.used_count, 'allow_guests', _row.allow_guests);
END;
$$;

REVOKE ALL ON FUNCTION public.create_meeting_invite_link(uuid, integer, integer, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_meeting_invite_link(uuid, integer, integer, text, boolean) TO authenticated;

-- ------------------------------------------------ 4. Khách đổi link lấy vé --

CREATE OR REPLACE FUNCTION public.redeem_meeting_guest_link(
  _token text,
  _display_name text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Dò vét token 64 hex là vô vọng, nhưng trần này chặn một client lặp biến
  -- link thành máy bơm row + outbox. Khách thật chỉ đổi link đúng một lần.
  _rate_window CONSTANT interval := interval '60 seconds';
  _rate_max    CONSTANT int := 20;
  _link       public.meeting_invite_links;
  _m          public.meetings;
  _name       text;
  _recent     int;
  _guest_id   uuid;
  _session    text;
BEGIN
  _name := btrim(COALESCE(_display_name, ''));
  IF length(_name) < 2 OR length(_name) > 80 THEN
    RETURN jsonb_build_object('status','invalid_name');
  END IF;

  SELECT * INTO _link FROM public.meeting_invite_links
   WHERE token_hash = encode(digest(_token,'sha256'),'hex')
   FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','invalid'); END IF;

  -- Cờ khách xét trước mọi thứ khác: link nội bộ phải im lặng như thể không
  -- tồn tại với người ngoài, không tiết lộ là có cuộc họp nào đó ở đây.
  IF NOT _link.allow_guests THEN
    RETURN jsonb_build_object('status','guests_not_allowed');
  END IF;

  IF _link.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('status','revoked');
  END IF;
  IF _link.expires_at IS NOT NULL AND _link.expires_at < now() THEN
    RETURN jsonb_build_object('status','expired');
  END IF;
  IF _link.max_uses IS NOT NULL AND _link.used_count >= _link.max_uses THEN
    RETURN jsonb_build_object('status','exhausted');
  END IF;

  SELECT count(*) INTO _recent FROM public.meeting_guests
   WHERE invite_link_id = _link.id AND created_at > now() - _rate_window;
  IF _recent >= _rate_max THEN
    RAISE EXCEPTION 'RATE_LIMITED: meeting guest redeem' USING ERRCODE='53400';
  END IF;

  SELECT * INTO _m FROM public.meetings
   WHERE id = _link.meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF _m.status NOT IN ('scheduled','live') THEN
    RETURN jsonb_build_object('status','not_joinable');
  END IF;

  IF NOT public.check_quota(_m.tenant_id, 'meetings.conference', 0) THEN
    RAISE EXCEPTION 'ENTITLEMENT_DENIED: meetings.conference' USING ERRCODE='42501';
  END IF;
  IF NOT public.check_quota(_m.tenant_id, 'meeting_participant_minutes', 1) THEN
    PERFORM public._raise_quota_exceeded(_m.tenant_id, 'meeting_participant_minutes', 1);
  END IF;

  _session := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');

  -- Phiên khách sống tới khi cuộc họp kết thúc, cộng biên 4 giờ cho họp kéo dài.
  INSERT INTO public.meeting_guests(
    tenant_id, meeting_id, invite_link_id, display_name, session_token_hash, expires_at)
  VALUES (
    _m.tenant_id, _link.meeting_id, _link.id, _name,
    encode(digest(_session,'sha256'),'hex'),
    GREATEST(_m.end_at, now()) + interval '4 hours')
  RETURNING id INTO _guest_id;

  UPDATE public.meeting_invite_links
     SET used_count = used_count + 1, updated_at = now()
   WHERE id = _link.id;

  PERFORM public._emit_outbox_event(_m.tenant_id, 'meeting.guest.joined', 'meeting', _m.id::text,
    jsonb_build_object('meeting_id', _m.id, 'guest_id', _guest_id,
                       'display_name', _name, 'invite_link_id', _link.id),
    NULL, NULL);

  RETURN jsonb_build_object(
    'status','joined',
    'guest_id', _guest_id,
    'session_token', _session,
    'meeting_id', _m.id,
    'title', _m.title,
    'display_name', _name);
END;
$$;

-- --------------------------------------------- 5. Khách xin lại vé LiveKit --

CREATE OR REPLACE FUNCTION public.issue_meeting_guest_token(
  _session_token text,
  _token_fingerprint text,
  _expires_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rate_window CONSTANT interval := interval '60 seconds';
  _rate_max    CONSTANT int := 10;
  _g      public.meeting_guests;
  _m      public.meetings;
  _recent int;
BEGIN
  SELECT * INTO _g FROM public.meeting_guests
   WHERE session_token_hash = encode(digest(_session_token,'sha256'),'hex');
  IF NOT FOUND THEN RETURN jsonb_build_object('status','invalid'); END IF;

  -- Chủ toạ mời khách ra khỏi phòng = set revoked_at. Khách không xin lại vé
  -- được nữa, nên không thể tự quay lại bằng token cũ trong tay.
  IF _g.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('status','revoked'); END IF;
  IF _g.expires_at < now() THEN RETURN jsonb_build_object('status','expired'); END IF;

  SELECT count(*) INTO _recent FROM public.meeting_join_tokens
   WHERE user_id = _g.id AND meeting_id = _g.meeting_id
     AND issued_at > now() - _rate_window;
  IF _recent >= _rate_max THEN
    RAISE EXCEPTION 'RATE_LIMITED: meeting guest token' USING ERRCODE='53400';
  END IF;

  SELECT * INTO _m FROM public.meetings
   WHERE id = _g.meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF _m.status NOT IN ('scheduled','live') THEN
    RETURN jsonb_build_object('status','not_joinable');
  END IF;

  IF NOT public.check_quota(_m.tenant_id, 'meeting_participant_minutes', 1) THEN
    PERFORM public._raise_quota_exceeded(_m.tenant_id, 'meeting_participant_minutes', 1);
  END IF;

  IF _m.conference_provider IS NULL OR _m.conference_ref IS NULL THEN
    UPDATE public.meetings
       SET conference_provider = COALESCE(conference_provider, 'livekit'),
           conference_ref = COALESCE(conference_ref, jsonb_build_object(
             'provider', 'livekit', 'roomName', 'mtg_' || _m.id::text, 'region', NULL)),
           updated_at = now()
     WHERE id = _m.id
     RETURNING * INTO _m;
  END IF;

  INSERT INTO public.meeting_join_tokens(
    tenant_id, meeting_id, user_id, role, token_fingerprint, expires_at, is_guest)
  VALUES (_g.tenant_id, _g.meeting_id, _g.id, 'participant', _token_fingerprint, _expires_at, true);

  UPDATE public.meeting_guests
     SET last_seen_at = now(),
         first_joined_at = COALESCE(first_joined_at, now()),
         updated_at = now()
   WHERE id = _g.id;

  RETURN jsonb_build_object(
    'status','ok',
    'guest_id', _g.id,
    'meeting_id', _g.meeting_id,
    'display_name', _g.display_name,
    'room_name', COALESCE(_m.conference_ref->>'roomName', 'mtg_' || _m.id::text),
    'provider', COALESCE(_m.conference_provider, 'livekit'),
    'title', _m.title);
END;
$$;

-- Hoàn thiện vết audit sau khi đã ký vé. Tách riêng vì lúc gate chạy thì chưa
-- có token để băm, mà gate phải ghi vết trong cùng transaction với lúc quyết
-- định cho vào. Không tìm thấy phiên thì im lặng — đây chỉ là bước làm đẹp vết.
CREATE OR REPLACE FUNCTION public.record_meeting_guest_token_fingerprint(
  _session_token text,
  _token_fingerprint text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _g public.meeting_guests;
BEGIN
  SELECT * INTO _g FROM public.meeting_guests
   WHERE session_token_hash = encode(digest(_session_token,'sha256'),'hex');
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.meeting_join_tokens
     SET token_fingerprint = _token_fingerprint
   WHERE id = (
     SELECT id FROM public.meeting_join_tokens
      WHERE user_id = _g.id AND meeting_id = _g.meeting_id AND is_guest
      ORDER BY issued_at DESC
      LIMIT 1
   );
END;
$$;

-- ---------------------------------------------- 6. Chủ toạ mời khách ra --

CREATE OR REPLACE FUNCTION public.revoke_meeting_guest(
  _guest_id uuid,
  _correlation_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _g public.meeting_guests;
  _role text;
BEGIN
  PERFORM public._set_correlation_context(_correlation_id);
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;

  SELECT * INTO _g FROM public.meeting_guests WHERE id = _guest_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RESOURCE_NOT_FOUND' USING ERRCODE='02000'; END IF;

  SELECT mp.role INTO _role FROM public.meeting_participants mp
   WHERE mp.meeting_id = _g.meeting_id AND mp.user_id = _actor;

  IF COALESCE(_role,'') NOT IN ('host','moderator')
     AND NOT public.has_tenant_role(_g.tenant_id, 'tenant_admin')
     AND NOT public.has_tenant_role(_g.tenant_id, 'tenant_owner') THEN
    RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  UPDATE public.meeting_guests
     SET revoked_at = COALESCE(revoked_at, now()), updated_at = now()
   WHERE id = _guest_id;

  PERFORM public._emit_outbox_event(_g.tenant_id, 'meeting.guest.revoked', 'meeting',
    _g.meeting_id::text,
    jsonb_build_object('meeting_id', _g.meeting_id, 'guest_id', _guest_id),
    NULL, _correlation_id);

  -- Trả kèm tên phòng LiveKit để tầng trên đá khách ra khỏi phòng đang mở;
  -- thu hồi ở đây mới chỉ chặn xin vé mới.
  RETURN jsonb_build_object(
    'status','revoked',
    'guest_id', _guest_id,
    'identity', 'guest:' || _guest_id::text,
    'room_name', (
      SELECT COALESCE(m.conference_ref->>'roomName', 'mtg_' || m.id::text)
        FROM public.meetings m WHERE m.id = _g.meeting_id
    ));
END;
$$;

-- ------------------------------------------- 6b. Chủ toạ xem danh sách khách --

-- Qua RPC chứ không để server fn đọc thẳng bảng: Domain SDK gate yêu cầu server
-- action chỉ chạm bảng domain qua RPC, và kiểm quyền gom về một chỗ với
-- revoke_meeting_guest cho khỏi lệch nhau.
CREATE OR REPLACE FUNCTION public.list_meeting_guests(_meeting_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _m public.meetings;
  _role text;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT * INTO _m FROM public.meetings WHERE id = _meeting_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEETING_NOT_FOUND' USING ERRCODE='02000'; END IF;

  SELECT mp.role INTO _role FROM public.meeting_participants mp
   WHERE mp.meeting_id = _meeting_id AND mp.user_id = _actor;

  IF COALESCE(_role,'') NOT IN ('host','moderator')
     AND NOT public.has_tenant_role(_m.tenant_id, 'tenant_admin')
     AND NOT public.has_tenant_role(_m.tenant_id, 'tenant_owner') THEN
    RAISE EXCEPTION 'MEETING_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'guest_id', g.id,
             'display_name', g.display_name,
             'joined_at', g.first_joined_at,
             'last_seen_at', g.last_seen_at,
             'revoked_at', g.revoked_at
           ) ORDER BY g.created_at)
      FROM public.meeting_guests g
     WHERE g.meeting_id = _meeting_id
  ), '[]'::jsonb);
END;
$$;

-- --------------------------------------------------------------- 7. Quyền --

-- Hai hàm dưới đây là bề mặt công khai duy nhất. `anon` KHÔNG có quyền trên bảng
-- nào; mọi thứ nó làm được đều nằm trong thân hai hàm SECURITY DEFINER này.
REVOKE ALL ON FUNCTION public.redeem_meeting_guest_link(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_meeting_guest_link(text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.issue_meeting_guest_token(text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_meeting_guest_token(text, text, timestamptz) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.record_meeting_guest_token_fingerprint(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_meeting_guest_token_fingerprint(text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.revoke_meeting_guest(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_meeting_guest(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.list_meeting_guests(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_meeting_guests(uuid) TO authenticated;
